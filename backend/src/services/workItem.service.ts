import { prisma } from '../db';
import { AuthUser } from '../middleware/auth';
import { assertTeamAccess, getUserRoleInTeam } from '../middleware/authorize';
import {
  ConflictError,
  NotFoundError,
  StaleObjectError,
  ForbiddenError,
  AppError,
} from '../errors';
import { validateTransition } from '../workflow/stateMachine';
import { OutboxService } from './outbox.service';

export interface ListWorkItemsParams {
  teamId?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignee?: string;
  view?: 'assigned_to_me' | 'unassigned_urgent' | 'awaiting_my_approval';
  q?: string;
  cursor?: string;
  limit?: number;
  page?: number;
}

export class WorkItemService {
  /**
   * List work items with server-side filtering, full text search, and pagination.
   * Scoped to the user's teams unless an explicit team is selected.
   */
  static async listWorkItems(user: AuthUser, params: ListWorkItemsParams) {
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const userTeamIds = user.memberships.map((m) => m.teamId);

    // If user specified a teamId, verify membership
    if (params.teamId) {
      assertTeamAccess(user, params.teamId, 'VIEWER');
    }

    const where: any = {};

    // Scope to teams user belongs to
    if (params.teamId) {
      where.teamId = params.teamId;
    } else {
      where.teamId = { in: userTeamIds };
    }

    // Preset Views
    if (params.view === 'assigned_to_me') {
      where.assigneeId = user.id;
      where.status = { not: 'CLOSED' };
    } else if (params.view === 'unassigned_urgent') {
      where.assigneeId = null;
      where.priority = { in: ['HIGH', 'URGENT'] };
      where.status = 'OPEN';
    } else if (params.view === 'awaiting_my_approval') {
      where.status = 'AWAITING_APPROVAL';
    }

    // Explicit filters
    if (params.status) {
      where.status = params.status;
    }
    if (params.priority) {
      where.priority = params.priority;
    }
    if (params.type) {
      where.type = params.type;
    }
    if (params.assignee) {
      if (params.assignee === 'me') {
        where.assigneeId = user.id;
      } else if (params.assignee === 'unassigned') {
        where.assigneeId = null;
      } else {
        where.assigneeId = params.assignee;
      }
    }

    // Search query on title and description
    if (params.q && params.q.trim()) {
      const query = params.q.trim();
      where.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
      ];
    }

    // Count total for metadata
    const totalCount = await prisma.workItem.count({ where });

    // Cursor pagination setup
    const queryOptions: any = {
      where,
      take: limit + 1, // take 1 extra to determine hasMore
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        team: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, activityEvents: true } },
      },
    };

    if (params.cursor) {
      queryOptions.cursor = { id: params.cursor };
      queryOptions.skip = 1; // Skip the cursor itself
    } else if (params.page && params.page > 1) {
      queryOptions.skip = (params.page - 1) * limit;
    }

    const items = await prisma.workItem.findMany(queryOptions);

    let hasMore = false;
    let nextCursor: string | null = null;

    if (items.length > limit) {
      hasMore = true;
      items.pop(); // Remove extra item
      nextCursor = items[items.length - 1]?.id || null;
    }

    return {
      items,
      totalCount,
      limit,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Fetch single work item with detailed activity history and comments.
   */
  static async getWorkItemById(user: AuthUser, id: string) {
    const item = await prisma.workItem.findUnique({
      where: { id },
      include: {
        team: true,
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        activityEvents: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        comments: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundError(`Work item '${id}' not found`);
    }

    // Scoped team access check
    assertTeamAccess(user, item.teamId, 'VIEWER');

    return item;
  }

  /**
   * Create work item inside transaction with activity event and outbox job.
   */
  static async createWorkItem(
    user: AuthUser,
    data: {
      title: string;
      description: string;
      type: string;
      priority: string;
      teamId: string;
      dueDate?: string;
    }
  ) {
    // Requires at least MEMBER role in that team
    assertTeamAccess(user, data.teamId, 'MEMBER');

    return prisma.$transaction(async (tx) => {
      const item = await tx.workItem.create({
        data: {
          title: data.title,
          description: data.description,
          type: data.type,
          priority: data.priority,
          status: 'OPEN',
          teamId: data.teamId,
          createdById: user.id,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          version: 1,
        },
        include: {
          team: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Immutable activity event in same transaction
      await tx.activityEvent.create({
        data: {
          workItemId: item.id,
          userId: user.id,
          eventType: 'CREATED',
          toState: 'OPEN',
          details: JSON.stringify({
            title: item.title,
            priority: item.priority,
            type: item.type,
            teamId: item.teamId,
          }),
        },
      });

      // Outbox job in same transaction
      await OutboxService.enqueueJob(tx, 'STATUS_CHANGE_ALERT', {
        workItemId: item.id,
        workItemTitle: item.title,
        action: 'CREATED',
        actorId: user.id,
        actorName: user.name,
      });

      return item;
    });
  }

  /**
   * Atomic Claim:
   * Uses conditional update `WHERE id = ? AND assigneeId IS NULL`.
   * Guarantees that if two users claim concurrently, exactly one succeeds and the other gets 409 Conflict.
   */
  static async claimWorkItem(user: AuthUser, id: string) {
    return prisma.$transaction(async (tx) => {
      // Check work item exists and user belongs to team
      const existing = await tx.workItem.findUnique({
        where: { id },
        include: { team: true },
      });

      if (!existing) {
        throw new NotFoundError(`Work item '${id}' not found`);
      }

      assertTeamAccess(user, existing.teamId, 'MEMBER');

      // Atomic conditional update
      const updateResult = await tx.workItem.updateMany({
        where: {
          id,
          assigneeId: null, // Critical: only claim if unassigned!
        },
        data: {
          assigneeId: user.id,
          status: existing.status === 'OPEN' ? 'IN_PROGRESS' : existing.status,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        // Someone claimed it right before us or it is already claimed!
        const currentItem = await tx.workItem.findUnique({
          where: { id },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        });

        throw new ConflictError(
          `Cannot claim work item: already claimed by ${currentItem?.assignee?.name || 'another team member'}.`,
          {
            currentAssignee: currentItem?.assignee,
            currentVersion: currentItem?.version,
            currentStatus: currentItem?.status,
          }
        );
      }

      // Record activity event in same transaction
      await tx.activityEvent.create({
        data: {
          workItemId: id,
          userId: user.id,
          eventType: 'CLAIMED',
          fromState: existing.status,
          toState: existing.status === 'OPEN' ? 'IN_PROGRESS' : existing.status,
          details: JSON.stringify({
            claimedBy: user.name,
            claimedById: user.id,
          }),
        },
      });

      // Reliable outbox job in same transaction
      await OutboxService.enqueueJob(tx, 'NOTIFICATION_ASSIGNEE', {
        workItemId: id,
        workItemTitle: existing.title,
        action: 'CLAIMED',
        actorId: user.id,
        actorName: user.name,
        targetUserId: user.id,
      });

      return tx.workItem.findUnique({
        where: { id },
        include: {
          team: true,
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  /**
   * Workflow State Transition:
   * Validates transition rules, enforces role requirements (e.g. Lead for approvals),
   * and checks optimistic concurrency version.
   */
  static async transitionWorkItem(
    user: AuthUser,
    id: string,
    targetStatus: string,
    expectedVersion: number
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workItem.findUnique({
        where: { id },
        include: { team: true },
      });

      if (!existing) {
        throw new NotFoundError(`Work item '${id}' not found`);
      }

      const role = assertTeamAccess(user, existing.teamId, 'MEMBER');

      // Validate state machine rule and user role
      const validation = validateTransition(existing.status, targetStatus, role);
      if (!validation.valid) {
        if (validation.statusCode === 403) {
          throw new ForbiddenError(validation.error || 'Forbidden transition');
        }
        throw new AppError(validation.error || 'Invalid transition', 400);
      }

      // Optimistic concurrency check
      const updateResult = await tx.workItem.updateMany({
        where: {
          id,
          version: expectedVersion,
        },
        data: {
          status: targetStatus,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const latest = await tx.workItem.findUnique({ where: { id } });
        throw new StaleObjectError(
          `Version conflict: Work item was modified by another user (expected version ${expectedVersion}, current version is ${latest?.version})`,
          latest
        );
      }

      // Record activity event in same transaction
      await tx.activityEvent.create({
        data: {
          workItemId: id,
          userId: user.id,
          eventType: 'STATUS_TRANSITION',
          fromState: existing.status,
          toState: targetStatus,
          details: JSON.stringify({
            transitionBy: user.name,
            transitionRole: role,
          }),
        },
      });

      // Outbox job in same transaction
      const jobType =
        targetStatus === 'AWAITING_APPROVAL'
          ? 'NOTIFICATION_LEAD_APPROVAL'
          : 'STATUS_CHANGE_ALERT';

      await OutboxService.enqueueJob(tx, jobType, {
        workItemId: id,
        workItemTitle: existing.title,
        action: `TRANSITION_${existing.status}_TO_${targetStatus}`,
        actorId: user.id,
        actorName: user.name,
        targetRole: targetStatus === 'AWAITING_APPROVAL' ? 'LEAD' : undefined,
      });

      return tx.workItem.findUnique({
        where: { id },
        include: {
          team: true,
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  /**
   * Update Work Item (Title, Description, Priority, Assignee):
   * Enforces optimistic concurrency locking on version!
   */
  static async updateWorkItem(
    user: AuthUser,
    id: string,
    updates: {
      title?: string;
      description?: string;
      priority?: string;
      type?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
    },
    expectedVersion: number
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workItem.findUnique({
        where: { id },
        include: { team: true },
      });

      if (!existing) {
        throw new NotFoundError(`Work item '${id}' not found`);
      }

      const role = assertTeamAccess(user, existing.teamId, 'MEMBER');

      // Viewers cannot update
      if (role === 'VIEWER') {
        throw new ForbiddenError('Viewers have read-only access to work items');
      }

      // Reassigning an item to someone else requires LEAD or ADMIN
      if (
        updates.assigneeId !== undefined &&
        updates.assigneeId !== existing.assigneeId &&
        updates.assigneeId !== user.id
      ) {
        if (role !== 'LEAD' && role !== 'ADMIN') {
          throw new ForbiddenError(
            'Only Team Leads or Admins can reassign items to other team members'
          );
        }
      }

      const updateData: any = {
        version: { increment: 1 },
      };

      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.type !== undefined) updateData.type = updates.type;
      if (updates.assigneeId !== undefined) updateData.assigneeId = updates.assigneeId;
      if (updates.dueDate !== undefined) {
        updateData.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
      }

      // Optimistic concurrency conditional update
      const updateResult = await tx.workItem.updateMany({
        where: {
          id,
          version: expectedVersion,
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
        const latest = await tx.workItem.findUnique({
          where: { id },
          include: { assignee: true },
        });
        throw new StaleObjectError(
          `Version conflict: item has been modified by another user (expected version ${expectedVersion}, current version is ${latest?.version})`,
          latest
        );
      }

      // Prepare activity event details
      const changes: Record<string, any> = {};
      if (updates.priority && updates.priority !== existing.priority) {
        changes.priority = { from: existing.priority, to: updates.priority };
      }
      if (updates.assigneeId !== undefined && updates.assigneeId !== existing.assigneeId) {
        changes.assignee = { from: existing.assigneeId, to: updates.assigneeId };
      }
      if (updates.title && updates.title !== existing.title) {
        changes.title = { from: existing.title, to: updates.title };
      }

      // Write activity event in same transaction
      await tx.activityEvent.create({
        data: {
          workItemId: id,
          userId: user.id,
          eventType: updates.priority && updates.priority !== existing.priority ? 'PRIORITY_CHANGED' : 'EDITED',
          details: JSON.stringify(changes),
        },
      });

      return tx.workItem.findUnique({
        where: { id },
        include: {
          team: true,
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  /**
   * Add comment to work item in transaction with activity event
   */
  static async addComment(user: AuthUser, id: string, content: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workItem.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError(`Work item '${id}' not found`);
      }

      assertTeamAccess(user, existing.teamId, 'MEMBER');

      const comment = await tx.comment.create({
        data: {
          workItemId: id,
          userId: user.id,
          content,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.activityEvent.create({
        data: {
          workItemId: id,
          userId: user.id,
          eventType: 'COMMENT_ADDED',
          details: JSON.stringify({
            commentId: comment.id,
            snippet: content.substring(0, 100),
          }),
        },
      });

      return comment;
    });
  }
}
