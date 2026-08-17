export const ACTIVE_RUN_STATUSES = new Set(['running', 'pending', 'scheduled', 'paused']);

export const TERMINAL_RUN_STATUSES = new Set([
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

const normalizedStatus = (status?: string | null) => String(status || '').trim().toLowerCase();

export const isActiveRunStatus = (status?: string | null) => ACTIVE_RUN_STATUSES.has(normalizedStatus(status));

export const isTerminalRunStatus = (status?: string | null) => TERMINAL_RUN_STATUSES.has(normalizedStatus(status));

export const jobLifecycleStatusLabel = (status?: string | null) => {
  switch (normalizedStatus(status)) {
    case 'active': return 'Active';
    case 'archived': return 'Archived';
    default: return 'Unknown';
  }
};

export const runStatusLabel = (status?: string | null) => {
  const normalized = normalizedStatus(status);
  if (!normalized) return 'Not started';
  return normalized.replace(/_/g, ' ').replace(/^./, (value) => value.toUpperCase());
};

export const jobLifecycleStatusBadgeClass = (status?: string | null) => {
  switch (normalizedStatus(status)) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'archived':
      return 'border-neutral-300 bg-neutral-100 text-neutral-700';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
  }
};

export const runStatusBadgeClass = (status?: string | null) => {
  switch (normalizedStatus(status)) {
    case 'running':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    case 'completed':
    case 'done':
    case 'finished':
    case 'succeeded':
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'failed':
    case 'error':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'paused':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'pending':
    case 'scheduled':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800';
    case 'cancelled':
    case 'canceled':
      return 'border-neutral-300 bg-neutral-100 text-neutral-700';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
  }
};
