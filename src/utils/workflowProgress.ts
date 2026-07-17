import type { WorkflowProgress } from '../api';

export const formatElapsed = (seconds?: number) => {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
};

const COMPLETED_STEP_STATUSES = new Set(['completed', 'done', 'succeeded', 'success', 'partial', 'skipped']);
const RUNNING_STEP_STATUSES = new Set(['running', 'active']);
const FAILED_STEP_STATUSES = new Set(['failed', 'cancelled', 'error']);

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
