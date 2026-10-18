export type WorkItemType =
  | 'INCIDENT'
  | 'CUSTOMER_ISSUE'
  | 'PAYMENT'
  | 'COMPLIANCE'
  | 'TASK';

export type WorkItemPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type WorkItemStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'RESOLVED'
  | 'CLOSED';

export type TeamRole = 'VIEWER' | 'MEMBER' | 'LEAD' | 'ADMIN';

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description?: string;
  userRole?: TeamRole | null;
  isMember?: boolean;
}

export interface ActivityEvent {
  id: string;
  workItemId: string;
  userId: string;
  eventType: string;
  fromState?: string | null;
  toState?: string | null;
  details: string; // JSON string
  createdAt: string;
  user?: UserSummary;
}

export interface Comment {
  id: string;
  workItemId: string;
  userId: string;
  content: string;
  createdAt: string;
  user?: UserSummary;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: WorkItemType;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  teamId: string;
  assigneeId?: string | null;
  createdById: string;
  dueDate?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  team?: TeamSummary;
  assignee?: UserSummary | null;
  createdBy?: UserSummary;
  activityEvents?: ActivityEvent[];
  comments?: Comment[];
  _count?: {
    comments: number;
    activityEvents: number;
  };
}

export interface AuthState {
  token: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    memberships: Array<{
      teamId: string;
      role: TeamRole;
      teamName: string;
    }>;
  } | null;
}

export interface OutboxJob {
  id: string;
  jobType: string;
  payload: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED';
  attempts: number;
  maxAttempts: number;
  nextRunAt: string;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}
