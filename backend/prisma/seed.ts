import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Newtonite Ops Database Seeding...');

  // Clean existing data
  await prisma.activityEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.outboxJob.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Purged existing database tables');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // 1. Create Teams
  const platformTeam = await prisma.team.create({
    data: {
      id: 'team-platform',
      name: 'Platform Core',
      description: 'Infrastructure, API Gateways, Cloud Resources & Resilience',
    },
  });

  const billingTeam = await prisma.team.create({
    data: {
      id: 'team-billing',
      name: 'Billing & Payments',
      description: 'Payment Gateways, Invoicing, Fraud Settlement & Reconciliation',
    },
  });

  const trustTeam = await prisma.team.create({
    data: {
      id: 'team-trust',
      name: 'Trust & Safety',
      description: 'Account Security, Fraud Mitigation, Policy & Compliance',
    },
  });

  const opsTeam = await prisma.team.create({
    data: {
      id: 'team-customer',
      name: 'Customer Operations',
      description: 'High-touch Enterprise Support, Triage & Incident Response',
    },
  });

  console.log('✅ Seeded 4 operational teams');

  // 2. Create Users & Memberships
  const usersData = [
    {
      id: 'user-admin',
      email: 'admin@newtonite.internal',
      name: 'Alex Vance (Global Admin)',
      memberships: [
        { teamId: platformTeam.id, role: 'ADMIN' },
        { teamId: billingTeam.id, role: 'ADMIN' },
        { teamId: trustTeam.id, role: 'ADMIN' },
        { teamId: opsTeam.id, role: 'ADMIN' },
      ],
    },
    {
      id: 'user-lead-platform',
      email: 'lead.platform@newtonite.internal',
      name: 'Sarah Chen (Platform Lead)',
      memberships: [{ teamId: platformTeam.id, role: 'LEAD' }],
    },
    {
      id: 'user-dev-platform',
      email: 'dev.platform@newtonite.internal',
      name: 'David Kim (Platform Engineer)',
      memberships: [{ teamId: platformTeam.id, role: 'MEMBER' }],
    },
    {
      id: 'user-lead-billing',
      email: 'lead.billing@newtonite.internal',
      name: 'Marcus Rodriguez (Billing Lead)',
      memberships: [{ teamId: billingTeam.id, role: 'LEAD' }],
    },
    {
      id: 'user-dev-billing',
      email: 'dev.billing@newtonite.internal',
      name: 'Elena Rostova (Billing Engineer)',
      memberships: [{ teamId: billingTeam.id, role: 'MEMBER' }],
    },
    {
      id: 'user-lead-trust',
      email: 'lead.trust@newtonite.internal',
      name: 'James Wilson (Trust Lead)',
      memberships: [{ teamId: trustTeam.id, role: 'LEAD' }],
    },
    {
      id: 'user-analyst-trust',
      email: 'analyst.trust@newtonite.internal',
      name: 'Priya Sharma (Trust Analyst)',
      memberships: [{ teamId: trustTeam.id, role: 'MEMBER' }],
    },
    {
      id: 'user-agent-ops',
      email: 'agent.ops@newtonite.internal',
      name: 'Fatima Al-Mansoor (Ops Specialist)',
      memberships: [{ teamId: opsTeam.id, role: 'MEMBER' }],
    },
    {
      id: 'user-viewer-auditor',
      email: 'viewer.auditor@newtonite.internal',
      name: 'Arthur Pendelton (Compliance Auditor)',
      memberships: [
        { teamId: platformTeam.id, role: 'VIEWER' },
        { teamId: billingTeam.id, role: 'VIEWER' },
      ],
    },
    {
      id: 'user-guest-read',
      email: 'guest@newtonite.internal',
      name: 'Guest Viewer (Read-Only)',
      memberships: [{ teamId: opsTeam.id, role: 'VIEWER' }],
    },
  ];

  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        id: u.id,
        email: u.email,
        name: u.name,
        password: hashedPassword,
      },
    });

    for (const m of u.memberships) {
      await prisma.teamMembership.create({
        data: {
          userId: user.id,
          teamId: m.teamId,
          role: m.role,
        },
      });
    }
  }

  console.log(`✅ Seeded ${usersData.length} users with defined roles`);

  // 3. Seed Realistic Operational Work Items
  const types = ['INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const statuses = ['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'];
  const teams = [platformTeam, billingTeam, trustTeam, opsTeam];

  const titleTemplates = [
    'API Gateway 502 Bad Gateway spike across cluster',
    'Postgres connection pool exhausted on primary write node',
    'Stripe charge capture timeout during batch settlement',
    'GDPR right-to-be-forgotten erasure request #84910',
    'Multi-region DNS failover sync failure',
    'Fraud detection flagged 200+ rapid card verification attempts',
    'Customer SLA breach risk: Enterprise support ticket #4912',
    'Kubernetes pod crash loop backoff on ingestion worker',
    'Monthly PCI-DSS audit report generation failure',
    'Kafka partition rebalance lag exceeded 250,000 offsets',
    'Credit card refund rollback state inconsistent in ledger',
    'SOC2 Type II access review signoff overdue',
    'Redis cache hit ratio drop below 60%',
    'Automated payout failure for vendor batch #1948',
    'TLS certificate rotation required on *.internal.newtonite.com',
  ];

  console.log('📦 Seeding sample work items to demonstrate server-side pagination (1,200 items)...');

  const batchSize = 100;
  const totalItems = 1200;
  const userIds = usersData.map((u) => u.id);

  for (let i = 0; i < totalItems; i += batchSize) {
    const itemsData = [];
    for (let j = 0; j < batchSize && i + j < totalItems; j++) {
      const idx = i + j;
      const team = teams[idx % teams.length];
      const status = statuses[idx % statuses.length];
      const priority = priorities[idx % priorities.length];
      const type = types[idx % types.length];
      const title = `${titleTemplates[idx % titleTemplates.length]} [REF-${1000 + idx}]`;
      const isAssigned = status !== 'OPEN' || Math.random() > 0.6;
      const assigneeId = isAssigned ? userIds[idx % userIds.length] : null;
      const createdById = userIds[(idx + 1) % userIds.length];

      itemsData.push({
        id: `item-${idx + 1}`,
        title,
        description: `Operational task details for ${title}. Critical telemetry indicator logged at metric timestamp ${new Date().toISOString()}. Immediate action protocol standard operating procedure must be adhered to.`,
        type,
        priority,
        status,
        teamId: team.id,
        assigneeId,
        createdById,
        version: 1,
        createdAt: new Date(Date.now() - (totalItems - idx) * 3600000), // staggered historical timestamps
      });
    }

    // Direct SQLite / Postgres insert
    for (const item of itemsData) {
      await prisma.workItem.create({ data: item });
    }
  }

  // Create initial activity event and comments for first 5 items
  for (let i = 1; i <= 5; i++) {
    await prisma.activityEvent.create({
      data: {
        workItemId: `item-${i}`,
        userId: 'user-admin',
        eventType: 'CREATED',
        toState: 'OPEN',
        details: JSON.stringify({ note: 'Initial incident report logged' }),
      },
    });

    await prisma.comment.create({
      data: {
        workItemId: `item-${i}`,
        userId: 'user-lead-platform',
        content: 'Primary telemetry logs inspected. Investigating root cause.',
      },
    });
  }

  console.log(`✅ Seeded ${totalItems} operational work items with activity events`);
  console.log('✨ Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
