import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { WorkItemService } from '../services/workItem.service';

const router = Router();

router.use(authenticate);

const createWorkItemSchema = z.object({
  title: z.string().min(3).max(250),
  description: z.string().min(3).max(5000),
  type: z.enum(['INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  teamId: z.string().min(1),
  dueDate: z.string().optional(),
});

const updateWorkItemSchema = z.object({
  title: z.string().min(3).max(250).optional(),
  description: z.string().min(3).max(5000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  type: z.enum(['INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  version: z.number().int().min(1), // Required for optimistic concurrency!
});

const transitionSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED']),
  version: z.number().int().min(1), // Required for optimistic concurrency!
});

const commentSchema = z.object({
  content: z.string().min(1).max(2000),
});

/**
 * List work items with server-side filters, search, and pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { teamId, status, priority, type, assignee, view, q, cursor, limit, page } =
      req.query;

    const result = await WorkItemService.listWorkItems(req.user!, {
      teamId: teamId as string | undefined,
      status: status as string | undefined,
      priority: priority as string | undefined,
      type: type as string | undefined,
      assignee: assignee as string | undefined,
      view: view as any,
      q: q as string | undefined,
      cursor: cursor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 20,
      page: page ? parseInt(page as string, 10) : undefined,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Get work item details with activity history and comments
 */
router.get('/:id', async (req, res, next) => {
  try {
    const item = await WorkItemService.getWorkItemById(req.user!, req.params.id);
    return res.json({ item });
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new work item with Idempotency-Key support
 */
router.post('/', idempotencyMiddleware(), async (req, res, next) => {
  try {
    const data = createWorkItemSchema.parse(req.body);
    const item = await WorkItemService.createWorkItem(req.user!, data);
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

/**
 * Atomic conditional claim with Idempotency-Key support
 */
router.post('/:id/claim', idempotencyMiddleware(), async (req, res, next) => {
  try {
    const item = await WorkItemService.claimWorkItem(req.user!, req.params.id);
    return res.json({
      message: 'Work item successfully claimed',
      item,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Workflow status transition with state machine validation & version check
 */
router.post('/:id/transition', async (req, res, next) => {
  try {
    const { status, version } = transitionSchema.parse(req.body);
    const item = await WorkItemService.transitionWorkItem(
      req.user!,
      req.params.id,
      status,
      version
    );
    return res.json({
      message: `Status transitioned to ${status}`,
      item,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update work item fields with optimistic concurrency version check
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { version, ...updates } = updateWorkItemSchema.parse(req.body);
    const item = await WorkItemService.updateWorkItem(
      req.user!,
      req.params.id,
      updates,
      version
    );
    return res.json({
      message: 'Work item successfully updated',
      item,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Add a comment to a work item
 */
router.post('/:id/comments', async (req, res, next) => {
  try {
    const { content } = commentSchema.parse(req.body);
    const comment = await WorkItemService.addComment(
      req.user!,
      req.params.id,
      content
    );
    return res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
});

export default router;
