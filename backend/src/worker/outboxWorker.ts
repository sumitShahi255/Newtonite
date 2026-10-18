import { prisma } from '../db';
import { OutboxPayload } from '../services/outbox.service';

// In-memory deduplication set to guarantee idempotent side-effect dispatch
// In production, this can also be backed by a Redis set or notification log table
export const dispatchedNotifications = new Set<string>();

export interface JobExecutionResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED' | 'RETRY_SCHEDULED';
  attempts: number;
  error?: string;
}

/**
 * Idempotent handler for outbound notifications.
 * Generates a unique deduplication key: `jobId` or `${workItemId}:${action}:${targetUserId}`.
 * If this key was already dispatched, logs dedup and completes without duplicate side effects!
 */
export async function executeJobHandler(job: {
  id: string;
  jobType: string;
  payload: string;
  attempts: number;
}): Promise<void> {
  const payload: OutboxPayload = JSON.parse(job.payload);

  // Artificial test hook: if title contains "[FORCE_OUTBOX_FAIL]", simulate a transient network error
  if (payload.workItemTitle && payload.workItemTitle.includes('[FORCE_OUTBOX_FAIL]')) {
    throw new Error('Simulated upstream webhook/notification service timeout');
  }

  // Idempotency deduplication key
  const deduplicationKey = `${job.jobType}:${payload.workItemId}:${payload.action}:${payload.targetUserId || 'global'}`;

  if (dispatchedNotifications.has(deduplicationKey)) {
    console.log(
      `[Worker Deduplicated] Side-effect for key '${deduplicationKey}' already executed. Idempotently acknowledged.`
    );
    return;
  }

  // Process side-effects based on job type
  switch (job.jobType) {
    case 'NOTIFICATION_ASSIGNEE':
      console.log(
        `[Worker Notification] Dispatched assignment alert to User (${payload.targetUserId}) for Work Item: "${payload.workItemTitle}" (Action by: ${payload.actorName})`
      );
      break;

    case 'NOTIFICATION_LEAD_APPROVAL':
      console.log(
        `[Worker Notification] Escalated approval request to Lead (${payload.targetRole}) for Work Item: "${payload.workItemTitle}"`
      );
      break;

    case 'STATUS_CHANGE_ALERT':
      console.log(
        `[Worker Notification] Broadcasted status transition "${payload.action}" for Work Item: "${payload.workItemTitle}"`
      );
      break;

    default:
      console.log(`[Worker Outbox] Processed custom job ${job.jobType} for item ${payload.workItemId}`);
  }

  // Mark side effect as executed
  dispatchedNotifications.add(deduplicationKey);
}

/**
 * Processes a single batch of pending outbox jobs.
 * Used both by the continuous background runner and by automated tests.
 */
export async function processPendingOutboxJobsOnce(batchSize: number = 10): Promise<JobExecutionResult[]> {
  const now = new Date();

  // Find candidate jobs
  const candidates = await prisma.outboxJob.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
      nextRunAt: { lte: now },
      attempts: { lt: 5 },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const results: JobExecutionResult[] = [];

  for (const job of candidates) {
    // Atomic reservation: conditional update to PROCESSING
    const reservation = await prisma.outboxJob.updateMany({
      where: {
        id: job.id,
        status: { in: ['PENDING', 'FAILED_RETRYABLE'] },
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
      },
    });

    if (reservation.count === 0) {
      // Picked up by another worker thread concurrently
      continue;
    }

    const currentAttempts = job.attempts + 1;

    try {
      await executeJobHandler({
        id: job.id,
        jobType: job.jobType,
        payload: job.payload,
        attempts: currentAttempts,
      });

      // Mark COMPLETED
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          lastError: null,
          updatedAt: new Date(),
        },
      });

      results.push({
        jobId: job.id,
        status: 'COMPLETED',
        attempts: currentAttempts,
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown processing error';

      if (currentAttempts >= job.maxAttempts) {
        // Capped attempts exceeded: transition to Dead-Letter FAILED
        await prisma.outboxJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            lastError: errorMessage,
            updatedAt: new Date(),
          },
        });

        results.push({
          jobId: job.id,
          status: 'FAILED',
          attempts: currentAttempts,
          error: errorMessage,
        });
      } else {
        // Exponential backoff: 2^attempts * 1000ms (e.g. 2s, 4s, 8s, 16s)
        const backoffMs = Math.pow(2, currentAttempts) * 1000;
        const nextRunAt = new Date(Date.now() + backoffMs);

        await prisma.outboxJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED_RETRYABLE',
            lastError: errorMessage,
            nextRunAt,
            updatedAt: new Date(),
          },
        });

        results.push({
          jobId: job.id,
          status: 'RETRY_SCHEDULED',
          attempts: currentAttempts,
          error: errorMessage,
        });
      }
    }
  }

  return results;
}

/**
 * Continuous polling daemon for production / local runtime
 */
export function startOutboxWorker(intervalMs: number = 2000) {
  console.log(`[Outbox Worker] Starting worker polling every ${intervalMs}ms...`);
  
  let isPolling = false;
  const interval = setInterval(async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      await processPendingOutboxJobsOnce(10);
    } catch (err) {
      console.error('[Outbox Worker Loop Error]', err);
    } finally {
      isPolling = false;
    }
  }, intervalMs);

  return () => clearInterval(interval);
}

// Standalone runner when file is executed directly (e.g., tsx src/worker/outboxWorker.ts)
if (require.main === module) {
  startOutboxWorker();
}
