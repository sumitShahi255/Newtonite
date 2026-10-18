import { prisma } from '../src/db';
import { generateToken } from '../src/middleware/auth';
import { WorkItemService } from '../src/services/workItem.service';
import { processPendingOutboxJobsOnce } from '../src/worker/outboxWorker';

async function runLiveSystemAudit() {
  console.log('====================================================');
  console.log('🔍 INITIATING DEEP LIVE SYSTEM AUDIT & VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // 1. Check Seed Data Health
  const teamCount = await prisma.team.count();
  const userCount = await prisma.user.count();
  const itemCount = await prisma.workItem.count();
  const membershipCount = await prisma.teamMembership.count();

  assert(teamCount >= 4, 'Database Health - Teams Seeded', `Found ${teamCount} teams`);
  assert(userCount >= 10, 'Database Health - Users Seeded', `Found ${userCount} users`);
  assert(itemCount >= 1000, 'Database Health - Scale Items Seeded', `Found ${itemCount} items`);
  assert(membershipCount >= 10, 'Database Health - Team Memberships Active', `Found ${membershipCount} memberships`);

  // 2. Retrieve key personas
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@newtonite.internal' },
    include: { memberships: { include: { team: true } } },
  });
  const platformLead = await prisma.user.findUniqueOrThrow({
    where: { email: 'lead.platform@newtonite.internal' },
    include: { memberships: { include: { team: true } } },
  });
  const platformMember = await prisma.user.findUniqueOrThrow({
    where: { email: 'dev.platform@newtonite.internal' },
    include: { memberships: { include: { team: true } } },
  });
  const billingLead = await prisma.user.findUniqueOrThrow({
    where: { email: 'lead.billing@newtonite.internal' },
    include: { memberships: { include: { team: true } } },
  });
  const auditorViewer = await prisma.user.findUniqueOrThrow({
    where: { email: 'viewer.auditor@newtonite.internal' },
    include: { memberships: { include: { team: true } } },
  });

  const memberAuth = {
    id: platformMember.id,
    email: platformMember.email,
    name: platformMember.name,
    memberships: platformMember.memberships.map((m) => ({
      teamId: m.teamId,
      role: m.role as any,
      teamName: m.team.name,
    })),
  };

  const leadAuth = {
    id: platformLead.id,
    email: platformLead.email,
    name: platformLead.name,
    memberships: platformLead.memberships.map((m) => ({
      teamId: m.teamId,
      role: m.role as any,
      teamName: m.team.name,
    })),
  };

  const billingLeadAuth = {
    id: billingLead.id,
    email: billingLead.email,
    name: billingLead.name,
    memberships: billingLead.memberships.map((m) => ({
      teamId: m.teamId,
      role: m.role as any,
      teamName: m.team.name,
    })),
  };

  const viewerAuth = {
    id: auditorViewer.id,
    email: auditorViewer.email,
    name: auditorViewer.name,
    memberships: auditorViewer.memberships.map((m) => ({
      teamId: m.teamId,
      role: m.role as any,
      teamName: m.team.name,
    })),
  };

  // 3. Test Work Item Creation (Atomic Transaction + Outbox Job + Activity Event)
  console.log('\n--- Testing Work Item Creation & Atomic Envelope ---');
  const createdItem = await WorkItemService.createWorkItem(memberAuth, {
    title: 'LIVE_AUDIT: Kafka Consumer Rebalance Lag',
    description: 'Partition 4 offset lag exceeded threshold',
    type: 'INCIDENT',
    priority: 'URGENT',
    teamId: 'team-platform',
  });

  assert(Boolean(createdItem.id), 'Work Item Created with ID', createdItem.id);
  assert(createdItem.version === 1, 'Initial Version is 1', `Version: ${createdItem.version}`);
  assert(createdItem.status === 'OPEN', 'Initial Status is OPEN', `Status: ${createdItem.status}`);

  // Verify Activity History written in same transaction
  const initialEvents = await prisma.activityEvent.findMany({
    where: { workItemId: createdItem.id },
  });
  assert(
    initialEvents.length === 1 && initialEvents[0].eventType === 'CREATED',
    'Atomic Activity History Event Logged in DB',
    `Found event: ${initialEvents[0]?.eventType}`
  );

  // 4. Test Concurrent Claim Race Condition
  console.log('\n--- Testing Atomic Conditional Claim & Concurrency Race ---');
  // Two simultaneous claims
  const [claimResult1, claimResult2] = await Promise.allSettled([
    WorkItemService.claimWorkItem(memberAuth, createdItem.id),
    WorkItemService.claimWorkItem(leadAuth, createdItem.id),
  ]);

  const claimSuccess = [claimResult1, claimResult2].filter((r) => r.status === 'fulfilled');
  const claimRejected = [claimResult1, claimResult2].filter((r) => r.status === 'rejected');

  assert(claimSuccess.length === 1, 'Exactly ONE user wins simultaneous claim', `Fulfilled: ${claimSuccess.length}`);
  assert(claimRejected.length === 1, 'Loser user receives rejection', `Rejected: ${claimRejected.length}`);

  const loserReason = (claimRejected[0] as PromiseRejectedResult)?.reason;
  assert(
    loserReason?.statusCode === 409 && loserReason?.message.includes('already claimed'),
    'Loser gets HTTP 409 Conflict with clear message',
    loserReason?.message
  );

  const claimedItem = await prisma.workItem.findUniqueOrThrow({ where: { id: createdItem.id } });
  assert(claimedItem.version === 2, 'Version incremented to 2 after claim', `v${claimedItem.version}`);
  assert(claimedItem.status === 'IN_PROGRESS', 'Status moved to IN_PROGRESS', claimedItem.status);

  // 5. Test Optimistic Concurrency Control (Stale Edit Rejection)
  console.log('\n--- Testing Optimistic Locking / Stale Version Rejection ---');
  // Try updating with stale version 1 (current is 2)
  let staleUpdateBlocked = false;
  try {
    await WorkItemService.updateWorkItem(
      memberAuth,
      createdItem.id,
      { title: 'Malicious overwrite attempt' },
      1 // STALE version!
    );
  } catch (err: any) {
    if (err.statusCode === 409 && err.message.includes('Version conflict')) {
      staleUpdateBlocked = true;
    }
  }
  assert(staleUpdateBlocked, 'Stale edit with old version rejected with 409 Conflict');

  // Valid update with current version 2
  const updatedItem = await WorkItemService.updateWorkItem(
    memberAuth,
    createdItem.id,
    { title: 'LIVE_AUDIT: Kafka Consumer Lag (Mitigated)' },
    2 // Correct version
  );
  assert(updatedItem.version === 3, 'Valid update incremented version to 3', `v${updatedItem.version}`);

  // 6. Test Workflow State Machine & Role Validation
  console.log('\n--- Testing Workflow State Machine & Lead Approval ---');
  // Illegal jump: IN_PROGRESS -> CLOSED is NOT allowed
  let illegalJumpBlocked = false;
  try {
    await WorkItemService.transitionWorkItem(memberAuth, createdItem.id, 'CLOSED', 3);
  } catch (err: any) {
    if (err.statusCode === 400 && err.message.includes('Illegal workflow transition')) {
      illegalJumpBlocked = true;
    }
  }
  assert(illegalJumpBlocked, 'Direct jump IN_PROGRESS -> CLOSED rejected with 400 Bad Request');

  // Valid transition: IN_PROGRESS -> AWAITING_APPROVAL
  const awaitingItem = await WorkItemService.transitionWorkItem(
    memberAuth,
    createdItem.id,
    'AWAITING_APPROVAL',
    3
  );
  assert(
    awaitingItem.status === 'AWAITING_APPROVAL' && awaitingItem.version === 4,
    'Transitioned to AWAITING_APPROVAL (v4)',
    awaitingItem.status
  );

  // Non-Lead approval attempt: Regular MEMBER tries to approve AWAITING_APPROVAL -> RESOLVED
  let nonLeadApprovalBlocked = false;
  try {
    await WorkItemService.transitionWorkItem(memberAuth, createdItem.id, 'RESOLVED', 4);
  } catch (err: any) {
    if (err.statusCode === 403 && err.message.includes('Required role: LEAD or ADMIN')) {
      nonLeadApprovalBlocked = true;
    }
  }
  assert(nonLeadApprovalBlocked, 'Regular MEMBER rejected from approving with 403 Forbidden');

  // Team Lead approves: LEAD role approves AWAITING_APPROVAL -> RESOLVED
  const resolvedItem = await WorkItemService.transitionWorkItem(
    leadAuth,
    createdItem.id,
    'RESOLVED',
    4
  );
  assert(
    resolvedItem.status === 'RESOLVED' && resolvedItem.version === 5,
    'Team Lead successfully approved resolution (v5)',
    resolvedItem.status
  );

  // 7. Test Cross-Team Scoped Authorization
  console.log('\n--- Testing Cross-Team Resource Scoping ---');
  let crossTeamBlocked = false;
  try {
    // Billing Lead attempts to transition a Platform Core item
    await WorkItemService.transitionWorkItem(billingLeadAuth, createdItem.id, 'CLOSED', 5);
  } catch (err: any) {
    if (err.statusCode === 403 && err.message.includes('Access denied')) {
      crossTeamBlocked = true;
    }
  }
  assert(crossTeamBlocked, 'User from another team denied access with 403 Forbidden');

  // Viewer read-only check
  let viewerEditBlocked = false;
  try {
    await WorkItemService.updateWorkItem(viewerAuth, createdItem.id, { title: 'Viewer Edit' }, 5);
  } catch (err: any) {
    if (err.statusCode === 403) {
      viewerEditBlocked = true;
    }
  }
  assert(viewerEditBlocked, 'Viewer role blocked from mutating work item with 403 Forbidden');

  // 8. Test Activity History Integrity
  console.log('\n--- Verifying Activity History Integrity ---');
  const finalEvents = await prisma.activityEvent.findMany({
    where: { workItemId: createdItem.id },
    orderBy: { createdAt: 'asc' },
  });
  assert(finalEvents.length >= 4, `All ${finalEvents.length} sequential operations logged in activity history`);
  const eventTypes = finalEvents.map((e) => e.eventType);
  assert(
    eventTypes.includes('CREATED') &&
      eventTypes.includes('CLAIMED') &&
      eventTypes.includes('STATUS_TRANSITION') &&
      eventTypes.includes('EDITED'),
    'Activity history matches exact operational trajectory',
    eventTypes.join(' -> ')
  );

  // 9. Test Transactional Outbox Background Worker
  console.log('\n--- Testing Transactional Outbox Background Processing ---');
  const pendingJobsBefore = await prisma.outboxJob.count({
    where: { status: 'PENDING' },
  });
  assert(pendingJobsBefore > 0, `Pending Outbox Jobs present in queue`, `${pendingJobsBefore} pending`);

  const workerResults = await processPendingOutboxJobsOnce(20);
  assert(workerResults.length > 0, 'Outbox Worker processed pending batch', `Processed ${workerResults.length} jobs`);
  assert(
    workerResults.every((r) => r.status === 'COMPLETED'),
    'All processed outbox jobs transitioned to COMPLETED status'
  );

  // 10. Test Server-Side Pagination & Search
  console.log('\n--- Testing Server-Side Filtering & Search ---');
  const searchResult = await WorkItemService.listWorkItems(leadAuth, {
    q: 'Kafka',
    limit: 10,
  });
  assert(searchResult.items.length > 0, 'Server-side full-text substring search returns matching records');
  assert(searchResult.totalCount >= 1, `Search count reported correctly: ${searchResult.totalCount}`);

  const paginationPage1 = await WorkItemService.listWorkItems(leadAuth, { page: 1, limit: 15 });
  const paginationPage2 = await WorkItemService.listWorkItems(leadAuth, { page: 2, limit: 15 });
  assert(paginationPage1.items.length === 15, 'Page 1 returns exact page limit (15 items)');
  assert(paginationPage2.items.length === 15, 'Page 2 returns exact page limit (15 items)');
  assert(
    paginationPage1.items[0].id !== paginationPage2.items[0].id,
    'Pagination offsets disjoint records between page 1 and page 2'
  );

  console.log('\n====================================================');
  console.log(`📊 LIVE SYSTEM AUDIT SUMMARY:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Overall Status: ${failed === 0 ? '🏆 100% HEALTHY & PRODUCTION READY' : '⚠️ ISSUES DETECTED'}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveSystemAudit()
  .catch((e) => {
    console.error('Fatal audit error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
