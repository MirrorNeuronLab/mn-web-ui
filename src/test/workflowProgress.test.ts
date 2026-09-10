import { describe, expect, it } from 'vitest';
import type { WorkflowProgress } from '../api';
import { formatElapsed, stepStatusBucket, workflowStepCounts } from '../utils/workflowProgress';

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

  it('counts success, finished, and canceled aliases consistently', () => {
    const progress = {
      steps: [
        { id: 'a', status: 'success' },
        { id: 'b', status: 'finished' },
        { id: 'c', status: 'canceled' },
        { id: 'd', status: 'cancelled' },
        { id: 'e', status: 'active' },
      ],
    } as unknown as WorkflowProgress;

    expect(workflowStepCounts(progress)).toEqual({ done: 2, running: 1, failed: 2, total: 5 });
  });
});

describe('stepStatusBucket', () => {
  it('maps every known alias to the same bucket used by counts, list, and graph', () => {
    for (const status of ['completed', 'done', 'succeeded', 'success', 'finished', 'partial', 'skipped']) {
      expect(stepStatusBucket(status)).toBe('done');
    }
    for (const status of ['running', 'active']) {
      expect(stepStatusBucket(status)).toBe('running');
    }
    for (const status of ['failed', 'cancelled', 'canceled', 'error']) {
      expect(stepStatusBucket(status)).toBe('failed');
    }
    for (const status of ['paused', 'pending', 'scheduled', 'queued']) {
      expect(stepStatusBucket(status)).not.toBe('failed');
    }
    expect(stepStatusBucket('')).toBeNull();
    expect(stepStatusBucket('something-new')).toBeNull();
  });
});
