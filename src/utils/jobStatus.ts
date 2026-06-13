export const ACTIVE_JOB_STATUSES = new Set(['running', 'pending', 'paused']);

export const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'done',
  'finished',
  'succeeded',
  'success',
  'failed',
  'cancelled',
  'canceled',
  'error',
]);

const normalizedStatus = (status?: string | null) => String(status || '').toLowerCase();

export const isActiveJobStatus = (status?: string | null) => ACTIVE_JOB_STATUSES.has(normalizedStatus(status));

export const isTerminalJobStatus = (status?: string | null) => TERMINAL_JOB_STATUSES.has(normalizedStatus(status));

export const jobStatusBadgeClass = (status: string) => {
  switch (normalizedStatus(status)) {
    case 'running':
    case 'completed':
    case 'failed':
    case 'error':
    case 'paused':
    case 'pending':
      return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    default:
      return 'bg-neutral-50 text-neutral-700 border-neutral-200';
  }
};
