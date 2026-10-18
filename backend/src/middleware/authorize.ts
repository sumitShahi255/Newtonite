import { Request, Response, NextFunction } from 'express';
import { AuthUser } from './auth';
import { ForbiddenError, NotFoundError } from '../errors';
import { prisma } from '../db';
import { TeamRole } from '../workflow/stateMachine';

export const ROLE_HIERARCHY: Record<TeamRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  LEAD: 3,
  ADMIN: 4,
};

export function getUserRoleInTeam(user: AuthUser, teamId: string): TeamRole | null {
  // Check if user has explicit membership in the team
  const membership = user.memberships.find((m) => m.teamId === teamId);
  if (membership) {
    return membership.role as TeamRole;
  }
  // Check if user is an ADMIN in any team (global operations capability)
  const isGlobalAdmin = user.memberships.some((m) => m.role === 'ADMIN');
  if (isGlobalAdmin) {
    return 'ADMIN';
  }
  return null;
}

export function assertTeamAccess(
  user: AuthUser,
  teamId: string,
  minRole: TeamRole = 'VIEWER'
): TeamRole {
  const role = getUserRoleInTeam(user, teamId);
  if (!role) {
    throw new ForbiddenError(
      `Access denied: You are not a member of team '${teamId}'`
    );
  }

  if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
    throw new ForbiddenError(
      `Insufficient team privileges: requires minimum role '${minRole}', but your role is '${role}'`
    );
  }

  return role;
}

/**
 * Middleware to check access to a specific work item by id (from req.params.id)
 */
export async function authorizeWorkItemAccess(
  minRole: TeamRole = 'VIEWER'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const itemId = req.params.id;
      if (!itemId) {
        return next();
      }

      const item = await prisma.workItem.findUnique({
        where: { id: itemId },
        select: { id: true, teamId: true, status: true, version: true, assigneeId: true },
      });

      if (!item) {
        throw new NotFoundError(`Work item '${itemId}' not found`);
      }

      // Assert user has access to this item's team
      const role = assertTeamAccess(req.user, item.teamId, minRole);
      
      // Attach resolved context to request for downstream handlers
      (req as any).workItem = item;
      (req as any).userTeamRole = role;

      next();
    } catch (err) {
      next(err);
    }
  };
}
