import { describe, expect, it } from 'vitest';
import type { WorkflowProgress } from '../api';
import { formatElapsed, workflowStepCounts } from '../utils/workflowProgress';

describe('formatElapsed', () => {
  it('formats missing and invalid durations as zero seconds', () => {
    expect(formatElapsed()).toBe('0s');
    expect(formatElapsed(-2)).toBe('0s');
    expect(formatElapsed(Number.NaN)).toBe('0s');
  });

  it('formats seconds, minutes, and hours consistently', () => {
    expect(formatElapsed(12.4)).toBe('12s');
    expect(formatElapsed(125)).toBe('2m 5s');
    expect(formatElapsed(7_245)).toBe('2h 0m');
  });
});

describe('workflowStepCounts', () => {
  it('summarizes public batch phases instead of worker totals', () => {
    const progress = {
      workflow_kind: 'batch',
      agent_count: { done: 4, running: 0, idle: 0, ready: 4, failed: 0, total: 21 },
      steps: [
        { id: 'detect', status: 'done' },
        { id: 'assemble', status: 'completed' },
        { id: 'prepare', status: 'succeeded' },
        { id: 'plan', status: 'queued' },
        { id: 'collect', status: 'pending' },
        { id: 'reconcile', status: 'pending' },
        { id: 'score', status: 'pending' },
        { id: 'audit', status: 'pending' },
        { id: 'write', status: 'pending' },
        { id: 'publish', status: 'pending' },
      ],
    } as unknown as WorkflowProgress;

    expect(workflowStepCounts(progress)).toEqual({ done: 3, running: 0, failed: 0, total: 10 });
  });
});
