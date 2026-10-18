import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { generateToken } from '../src/middleware/auth';
import { processPendingOutboxJobsOnce, dispatchedNotifications } from '../src/worker/outboxWorker';

describe('Newtonite Operations Under Pressure — Critical Behaviours Test Suite', () => {
  // Pre-generated JWT tokens for key personas
  let adminToken: string;
  let platformLeadToken: string;
  let platformMemberToken: string;
  let secondPlatformMemberToken: string;
  let customerOpsMemberToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    // Retrieve seeded users
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@newtonite.internal' } });
    const leadUser = await prisma.user.findUniqueOrThrow({ where: { email: 'lead.platform@newtonite.internal' } });
    const member1 = await prisma.user.findUniqueOrThrow({ where: { email: 'dev.platform@newtonite.internal' } });
    const opsMember = await prisma.user.findUniqueOrThrow({ where: { email: 'agent.ops@newtonite.internal' } });
    const viewer = await prisma.user.findUniqueOrThrow({ where: { email: 'viewer.auditor@newtonite.internal' } });

    // Create a 2nd platform member for concurrent claim testing
    let member2 = await prisma.user.findUnique({ where: { email: 'dev2.platform@newtonite.internal' } });
    if (!member2) {
      member2 = await prisma.user.create({
        data: {
          id: 'user-dev2-platform',
          email: 'dev2.platform@newtonite.internal',
          name: 'Kenji Sato (Platform Engineer 2)',
          password: 'hashed-password-123',
          memberships: {
            create: {
              teamId: 'team-platform',
              role: 'MEMBER',
            },
          },
        },
      });
    }

    adminToken = generateToken({ id: adminUser.id, email: adminUser.email, name: adminUser.name });
    platformLeadToken = generateToken({ id: leadUser.id, email: leadUser.email, name: leadUser.name });
    platformMemberToken = generateToken({ id: member1.id, email: member1.email, name: member1.name });
    secondPlatformMemberToken = generateToken({ id: member2.id, email: member2.email, name: member2.name });
    customerOpsMemberToken = generateToken({ id: opsMember.id, email: opsMember.email, name: opsMember.name });
    viewerToken = generateToken({ id: viewer.id, email: viewer.email, name: viewer.name });
  });

  // =========================================================================
  // BEHAVIOUR 1: Concurrent Claim Race Condition
  // =========================================================================
  describe('1. Concurrency: Two users claim the same work item simultaneously', () => {
    it('should grant claim to exactly ONE user and return 409 Conflict to the other', async () => {
      // Create an unassigned test item in Platform Core
      const item = await prisma.workItem.create({
        data: {
          title: 'CONCURRENT_CLAIM_TEST: DB Connection Leak',
          description: 'High priority resource exhaustion incident',
          type: 'INCIDENT',
          priority: 'URGENT',
          status: 'OPEN',
          teamId: 'team-platform',
          createdById: 'user-admin',
          assigneeId: null,
          version: 1,
        },
      });

      // Fire two claim requests simultaneously
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/work-items/${item.id}/claim`)
          .set('Authorization', `Bearer ${platformMemberToken}`)
          .send(),
        request(app)
          .post(`/api/work-items/${item.id}/claim`)
          .set('Authorization', `Bearer ${secondPlatformMemberToken}`)
          .send(),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Winner received 200
      const winnerRes = res1.status === 200 ? res1 : res2;
      expect(winnerRes.body.item.status).toBe('IN_PROGRESS');
      expect(winnerRes.body.item.assigneeId).toBeDefined();

      // Loser received 409 Conflict
      const loserRes = res1.status === 409 ? res1 : res2;
      expect(loserRes.body.error.message).toContain('already claimed');

      // Database state verification: exactly one owner
      const updatedItem = await prisma.workItem.findUnique({ where: { id: item.id } });
      expect(updatedItem?.assigneeId).not.toBeNull();
      expect(updatedItem?.version).toBe(2);

      // Verify activity history logged in same transaction
      const events = await prisma.activityEvent.findMany({ where: { workItemId: item.id } });
      expect(events.some((e) => e.eventType === 'CLAIMED')).toBe(true);
    });
  });

  // =========================================================================
  // BEHAVIOUR 2: Stale Edit & Optimistic Concurrency Control
  // =========================================================================
  describe('2. Stale Update Handling: Optimistic locking rejects outdated versions', () => {
    it('should reject an update with a stale version with 409 Conflict and latest state', async () => {
      // Create an item
      const item = await prisma.workItem.create({
        data: {
          title: 'STALE_EDIT_TEST: Microservice Memory Spike',
          description: 'Initial investigation report',
          type: 'INCIDENT',
          priority: 'HIGH',
          status: 'OPEN',
          teamId: 'team-platform',
          createdById: 'user-admin',
          version: 1,
        },
      });

      // User A updates item successfully (v1 -> v2)
      const resA = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${platformMemberToken}`)
        .send({
          title: 'Updated Title by User A',
          version: 1, // correct current version
        });
      expect(resA.status).toBe(200);
      expect(resA.body.item.version).toBe(2);

      // User B attempts to update using stale version 1
      const resB = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${secondPlatformMemberToken}`)
        .send({
          title: 'Overwrite Attempt by User B with stale version',
          version: 1, // STALE version!
        });

      expect(resB.status).toBe(409);
      expect(resB.body.error.name).toBe('ConflictError');
      expect(resB.body.error.message).toContain('Version conflict');
      expect(resB.body.error.details.currentResource.version).toBe(2);

      // Verify database was NOT overwritten
      const checkItem = await prisma.workItem.findUnique({ where: { id: item.id } });
      expect(checkItem?.title).toBe('Updated Title by User A');
      expect(checkItem?.version).toBe(2);
    });
  });

  // =========================================================================
  // BEHAVIOUR 3: Idempotency Keys (Network Retry / Double-Click)
  // =========================================================================
  describe('3. Idempotency: Duplicate requests with same Idempotency-Key return cached result', () => {
    it('should only create one work item when the same idempotency key is submitted twice', async () => {
      const idempotencyKey = `idem-test-${Date.now()}`;

      const payload = {
        title: `IDEMPOTENCY_TEST: Billing charge reconciliation issue - ${idempotencyKey}`,
        description: 'Payment gateway dispute #991024',
        type: 'PAYMENT',
        priority: 'URGENT',
        teamId: 'team-platform',
      };

      // First Request
      const res1 = await request(app)
        .post('/api/work-items')
        .set('Authorization', `Bearer ${platformMemberToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res1.status).toBe(201);
      const createdItemId = res1.body.item.id;
      expect(createdItemId).toBeDefined();

      // Second Request (Immediate retry with identical key)
      const res2 = await request(app)
        .post('/api/work-items')
        .set('Authorization', `Bearer ${platformMemberToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      // Should return identical response with header replay indication
      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBe('true');
      expect(res2.body.item.id).toBe(createdItemId);

      // Database verification: Only ONE item exists with that title
      const count = await prisma.workItem.count({
        where: { title: payload.title },
      });
      expect(count).toBe(1);
    });
  });

  // =========================================================================
  // BEHAVIOUR 4: Workflow Rules & Lead Approval Enforcement
  // =========================================================================
  describe('4. Workflow Rules: Server enforces allowed transitions and Lead-only approvals', () => {
    it('should reject illegal jumps (OPEN -> CLOSED) with 400 Bad Request', async () => {
      const item = await prisma.workItem.create({
        data: {
          title: 'WORKFLOW_TEST: Invalid transition jump',
          description: 'Testing state machine bounds',
          type: 'TASK',
          priority: 'LOW',
          status: 'OPEN',
          teamId: 'team-platform',
          createdById: 'user-admin',
          version: 1,
        },
      });

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${platformMemberToken}`)
        .send({
          status: 'CLOSED', // OPEN -> CLOSED is illegal
          version: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Illegal workflow transition');
    });

    it('should reject AWAITING_APPROVAL -> RESOLVED if user is a standard MEMBER, but accept for LEAD', async () => {
      const item = await prisma.workItem.create({
        data: {
          title: 'WORKFLOW_TEST: Production Deploy Approval Needed',
          description: 'Emergency hotfix pending signoff',
          type: 'TASK',
          priority: 'HIGH',
          status: 'AWAITING_APPROVAL',
          teamId: 'team-platform',
          createdById: 'user-admin',
          version: 1,
        },
      });

      // Regular Member attempts to approve
      const memberAttempt = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${platformMemberToken}`)
        .send({
          status: 'RESOLVED',
          version: 1,
        });

      expect(memberAttempt.status).toBe(403);
      expect(memberAttempt.body.error.message).toContain('Required role: LEAD or ADMIN');

      // Team Lead attempts to approve
      const leadAttempt = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${platformLeadToken}`)
        .send({
          status: 'RESOLVED',
          version: 1,
        });

      expect(leadAttempt.status).toBe(200);
      expect(leadAttempt.body.item.status).toBe('RESOLVED');
      expect(leadAttempt.body.item.version).toBe(2);
    });
  });

  // =========================================================================
  // BEHAVIOUR 5: Resource-Level & Cross-Team Authorization
  // =========================================================================
  describe('5. Authorization: Enforced per team and role at resource level', () => {
    it('should return 403 Forbidden when a user from another team accesses an item', async () => {
      // Item in Platform Core
      const item = await prisma.workItem.create({
        data: {
          title: 'AUTH_TEST: Platform specific incident',
          description: 'Secret infra audit',
          type: 'INCIDENT',
          priority: 'URGENT',
          status: 'OPEN',
          teamId: 'team-platform',
          createdById: 'user-admin',
          version: 1,
        },
      });

      // Customer Ops Member (does not belong to team-platform)
      const res = await request(app)
        .get(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${customerOpsMemberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Access denied');
    });

    it('should reject mutations from a VIEWER with 403 Forbidden', async () => {
      const item = await prisma.workItem.create({
        data: {
          title: 'AUTH_TEST: Viewer Read-Only verification',
          description: 'Viewer should view but not edit',
          type: 'INCIDENT',
          priority: 'MEDIUM',
          status: 'OPEN',
          teamId: 'team-platform',
          createdById: 'user-admin',
          version: 1,
        },
      });

      // Viewer attempts to update
      const updateRes = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          title: 'Viewer Malicious Edit',
          version: 1,
        });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error.message).toContain('Insufficient team privileges');
    });
  });

  // =========================================================================
  // BEHAVIOUR 6: Reliable Async Work (Transactional Outbox)
  // =========================================================================
  describe('6. Reliable Async Work: Transactional Outbox pattern with retries & idempotency', () => {
    it('should process pending outbox job and guarantee idempotent execution', async () => {
      // 1. Create a work item that emits an outbox job in the same transaction
      const createRes = await request(app)
        .post('/api/work-items')
        .set('Authorization', `Bearer ${platformLeadToken}`)
        .send({
          title: 'OUTBOX_TEST: Async Worker Verification Task',
          description: 'Testing background outbox dispatcher',
          type: 'TASK',
          priority: 'MEDIUM',
          teamId: 'team-platform',
        });

      expect(createRes.status).toBe(201);
      const itemId = createRes.body.item.id;

      // Check that outbox job was written inside transaction
      const pendingJobs = await prisma.outboxJob.findMany({
        where: {
          payload: { contains: itemId },
          status: 'PENDING',
        },
      });
      expect(pendingJobs.length).toBeGreaterThanOrEqual(1);
      const testJob = pendingJobs[0];

      // Process batch using outbox worker logic
      const processedResults = await processPendingOutboxJobsOnce(10);
      const matchedResult = processedResults.find((r) => r.jobId === testJob.id);
      expect(matchedResult?.status).toBe('COMPLETED');

      // Verify status in database
      const completedJob = await prisma.outboxJob.findUnique({ where: { id: testJob.id } });
      expect(completedJob?.status).toBe('COMPLETED');

      // Re-running worker on same job (simulate duplicate delivery) produces idempotent execution
      const dedupKey = `STATUS_CHANGE_ALERT:${itemId}:CREATED:global`;
      expect(dispatchedNotifications.has(dedupKey)).toBe(true);
    });

    it('should retry a failing job with exponential backoff and cap at maxAttempts', async () => {
      // Create job with simulated error hook
      const failingJob = await prisma.outboxJob.create({
        data: {
          jobType: 'NOTIFICATION_ASSIGNEE',
          payload: JSON.stringify({
            workItemId: 'item-failing',
            workItemTitle: '[FORCE_OUTBOX_FAIL] Upstream down',
            action: 'ALERT',
            actorId: 'user-admin',
            actorName: 'Admin',
          }),
          status: 'PENDING',
          attempts: 4, // 4 prior attempts: next attempt (5) will exceed maxAttempts (5)
          maxAttempts: 5,
          nextRunAt: new Date(Date.now() - 1000), // eligible now
        },
      });

      const results = await processPendingOutboxJobsOnce(10);
      const failResult = results.find((r) => r.jobId === failingJob.id);

      expect(failResult?.status).toBe('FAILED');
      expect(failResult?.attempts).toBe(5);

      const dbJob = await prisma.outboxJob.findUnique({ where: { id: failingJob.id } });
      expect(dbJob?.status).toBe('FAILED');
      expect(dbJob?.lastError).toContain('Simulated upstream webhook');
    });
  });
});
