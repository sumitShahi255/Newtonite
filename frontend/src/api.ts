import { WorkItem, OutboxJob } from './types';

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('newtonite_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('newtonite_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('newtonite_token');
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  useIdempotency: boolean = false
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (useIdempotency && ['POST', 'PUT', 'PATCH'].includes(options.method || 'GET')) {
    headers['Idempotency-Key'] = generateUUID();
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const error: any = new Error(data?.error?.message || response.statusText || 'Request failed');
    error.status = response.status;
    error.details = data?.error?.details || null;
    error.name = data?.error?.name || 'ApiError';
    throw error;
  }

  return data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string = 'Password123!') =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request<{ user: any }>('/auth/me'),

  getDemoUsers: () => request<{ users: any[] }>('/auth/demo-users'),

  // Teams
  getTeams: () => request<{ teams: any[] }>('/teams'),

  // Work Items
  getWorkItems: (params: Record<string, any>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });
    return request<{
      items: WorkItem[];
      totalCount: number;
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
    }>(`/work-items?${query.toString()}`);
  },

  getWorkItemById: (id: string) =>
    request<{ item: WorkItem }>(`/work-items/${id}`),

  createWorkItem: (data: {
    title: string;
    description: string;
    type: string;
    priority: string;
    teamId: string;
    dueDate?: string;
  }) =>
    request<{ item: WorkItem }>(
      '/work-items',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true // use Idempotency-Key
    ),

  claimWorkItem: (id: string) =>
    request<{ message: string; item: WorkItem }>(
      `/work-items/${id}/claim`,
      {
        method: 'POST',
      },
      true // use Idempotency-Key
    ),

  transitionWorkItem: (id: string, status: string, version: number) =>
    request<{ message: string; item: WorkItem }>(`/work-items/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status, version }),
    }),

  updateWorkItem: (
    id: string,
    updates: {
      title?: string;
      description?: string;
      priority?: string;
      type?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
    },
    version: number
  ) =>
    request<{ message: string; item: WorkItem }>(`/work-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, version }),
    }),

  addComment: (id: string, content: string) =>
    request<{ comment: any }>(`/work-items/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  // Outbox
  getOutboxJobs: () => request<{ jobs: OutboxJob[] }>('/outbox/jobs'),

  processOutboxBatch: () =>
    request<{ message: string; results: any[] }>('/outbox/process', {
      method: 'POST',
    }),
};
