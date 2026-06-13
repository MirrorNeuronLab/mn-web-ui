import { describe, expect, it } from 'vitest';
import { isActiveJobStatus, isTerminalJobStatus, jobStatusBadgeClass } from '../utils/jobStatus';

describe('job status helpers', () => {
  it('detects active and terminal statuses case-insensitively', () => {
    expect(isActiveJobStatus('RUNNING')).toBe(true);
    expect(isActiveJobStatus('completed')).toBe(false);
    expect(isTerminalJobStatus('SUCCESS')).toBe(true);
    expect(isTerminalJobStatus('paused')).toBe(false);
  });

  it('keeps the existing badge class grouping', () => {
    expect(jobStatusBadgeClass('running')).toBe('bg-neutral-100 text-neutral-950 border-neutral-300');
    expect(jobStatusBadgeClass('unknown')).toBe('bg-neutral-50 text-neutral-700 border-neutral-200');
  });
});
