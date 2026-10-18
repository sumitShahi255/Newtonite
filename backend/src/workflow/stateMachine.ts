export type WorkItemStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'RESOLVED'
  | 'CLOSED';

export type TeamRole = 'VIEWER' | 'MEMBER' | 'LEAD' | 'ADMIN';

export interface TransitionRule {
  from: WorkItemStatus;
  to: WorkItemStatus;
  allowedRoles: TeamRole[];
  description: string;
}

export const WORKFLOW_TRANSITIONS: TransitionRule[] = [
  {
    from: 'OPEN',
    to: 'IN_PROGRESS',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    description: 'Start working on item or claim it',
  },
  {
    from: 'IN_PROGRESS',
    to: 'AWAITING_APPROVAL',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    description: 'Submit completed item for Lead approval',
  },
  {
    from: 'IN_PROGRESS',
    to: 'RESOLVED',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    description: 'Direct resolve for items with standard clearance',
  },
  {
    from: 'IN_PROGRESS',
    to: 'OPEN',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    description: 'Release item back to the team unassigned queue',
  },
  {
    from: 'AWAITING_APPROVAL',
    to: 'RESOLVED',
    // Newtonite constraint: Approval step ONLY a Lead or Admin can pass!
    allowedRoles: ['LEAD', 'ADMIN'],
    description: 'Lead review and approval of completed operational item',
  },
  {
    from: 'AWAITING_APPROVAL',
    to: 'IN_PROGRESS',
    allowedRoles: ['LEAD', 'ADMIN'],
    description: 'Reject item back to In Progress for revisions',
  },
  {
    from: 'RESOLVED',
    to: 'CLOSED',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    description: 'Final closure of verified resolution',
  },
  {
    from: 'RESOLVED',
    to: 'IN_PROGRESS',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    description: 'Reopen resolved item for further remediation',
  },
  {
    from: 'CLOSED',
    to: 'OPEN',
    allowedRoles: ['LEAD', 'ADMIN'],
    description: 'Reopen closed incident',
  },
];

export function validateTransition(
  currentStatus: string,
  targetStatus: string,
  userRole: TeamRole
): { valid: boolean; error?: string; statusCode?: number } {
  if (currentStatus === targetStatus) {
    return { valid: false, error: `Item is already in status ${currentStatus}`, statusCode: 400 };
  }

  const matchingTransitions = WORKFLOW_TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.to === targetStatus
  );

  if (matchingTransitions.length === 0) {
    return {
      valid: false,
      error: `Illegal workflow transition from '${currentStatus}' to '${targetStatus}'. Allowed destinations: ${getValidNextStatuses(currentStatus).join(', ') || 'None'}`,
      statusCode: 400,
    };
  }

  const transition = matchingTransitions[0];
  if (!transition.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      error: `Role '${userRole}' is not authorized to transition from '${currentStatus}' to '${targetStatus}'. Required role: ${transition.allowedRoles.join(' or ')}`,
      statusCode: 403,
    };
  }

  return { valid: true };
}

export function getValidNextStatuses(currentStatus: string): string[] {
  return WORKFLOW_TRANSITIONS.filter((t) => t.from === currentStatus).map((t) => t.to);
}
