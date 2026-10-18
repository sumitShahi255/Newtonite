import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { OutboxService } from '../services/outbox.service';
import { processPendingOutboxJobsOnce } from '../worker/outboxWorker';

const router = Router();

router.use(authenticate);

/**
 * List recent outbox jobs for dashboard monitor
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const jobs = await OutboxService.listRecentJobs(50);
    return res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

/**
 * Trigger immediate manual processing of pending jobs (demonstrator & test tool)
 */
router.post('/process', async (req, res, next) => {
  try {
    const results = await processPendingOutboxJobsOnce(20);
    return res.json({
      message: `Processed ${results.length} outbox jobs`,
      results,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
