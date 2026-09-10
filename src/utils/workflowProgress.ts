import type { WorkflowProgress } from '../api';

export const formatElapsed = (seconds?: number) => {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
};

const COMPLETED_STEP_STATUSES = new Set(['completed', 'done', 'succeeded', 'success', 'finished', 'partial', 'skipped']);
const RUNNING_STEP_STATUSES = new Set(['running', 'active']);
const FAILED_STEP_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'error']);
const PENDING_STEP_STATUSES = new Set(['pending', 'scheduled', 'queued', 'validated', 'preparing', 'idle', 'ready']);
const PAUSED_STEP_STATUSES = new Set(['paused', 'pausing', 'blocked', 'retry_wait']);

export type StepStatusBucket = 'done' | 'running' | 'failed' | 'paused' | 'pending';

export const stepStatusBucket = (status?: string | null): StepStatusBucket | null => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return null;
  if (COMPLETED_STEP_STATUSES.has(normalized)) return 'done';
  if (RUNNING_STEP_STATUSES.has(normalized)) return 'running';
  if (FAILED_STEP_STATUSES.has(normalized)) return 'failed';
  if (PAUSED_STEP_STATUSES.has(normalized)) return 'paused';
  if (PENDING_STEP_STATUSES.has(normalized)) return 'pending';
  return null;
};

export const workflowStepCounts = (progress: WorkflowProgress | null | undefined) => {
  const steps = progress?.steps.length ? progress.steps : progress?.current_step ? [progress.current_step] : [];
  const counts = { done: 0, running: 0, failed: 0, total: steps.length };
  for (const step of steps) {
    const status = String(step.status || '').trim().toLowerCase();
    if (COMPLETED_STEP_STATUSES.has(status)) counts.done += 1;
    else if (RUNNING_STEP_STATUSES.has(status)) counts.running += 1;
    else if (FAILED_STEP_STATUSES.has(status)) counts.failed += 1;
  }
  return counts;
};
