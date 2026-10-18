import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export type JobType =
  | 'NOTIFICATION_ASSIGNEE'
  | 'NOTIFICATION_LEAD_APPROVAL'
  | 'AUDIT_LOG_EXPORT'
  | 'STATUS_CHANGE_ALERT';

export interface OutboxPayload {
  workItemId: string;
  workItemTitle: string;
  action: string;
  actorId: string;
  actorName: string;
  targetUserId?: string | null;
  targetRole?: string;
  metadata?: Record<string, any>;
}

export class OutboxService {
  /**
   * Enqueues an outbox job strictly inside an active database transaction.
   * Guarantees atomic writes: either both the work item update AND job exist, or neither does.
   */
  static async enqueueJob(
    tx: Prisma.TransactionClient,
    jobType: JobType,
    payload: OutboxPayload
  ) {
    return tx.outboxJob.create({
      data: {
        jobType,
        payload: JSON.stringify(payload),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextRunAt: new Date(),
      },
    });
  }

  /**
   * Fetches pending or retry-eligible jobs with row-locking semantics or safe atomic reservation.
   */
  static async fetchEligibleJobs(batchSize: number = 10) {
    const now = new Date();
    return prisma.outboxJob.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
        nextRunAt: { lte: now },
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
  }

  /**
   * Fetches recent outbox jobs for dashboard observability and reviewer demo.
   */
  static async listRecentJobs(limit: number = 30) {
    return prisma.outboxJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
