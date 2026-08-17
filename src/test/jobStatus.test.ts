import { describe, expect, it } from 'vitest';
import {
  isActiveRunStatus,
  isTerminalRunStatus,
  jobLifecycleStatusBadgeClass,
  jobLifecycleStatusLabel,
  runStatusBadgeClass,
  runStatusLabel,
} from '../utils/jobStatus';

describe('job status helpers', () => {
  it('detects active and terminal statuses case-insensitively', () => {
    expect(isActiveRunStatus('RUNNING')).toBe(true);
    expect(isActiveRunStatus('completed')).toBe(false);
    expect(isTerminalRunStatus('SUCCESS')).toBe(true);
    expect(isTerminalRunStatus('paused')).toBe(false);
  });

  it('keeps job lifecycle and run execution presentation separate', () => {
    expect(jobLifecycleStatusLabel('active')).toBe('Active');
    expect(jobLifecycleStatusBadgeClass('active')).toContain('emerald');
    expect(runStatusLabel(undefined)).toBe('Not started');
    expect(runStatusLabel('waiting_for_input')).toBe('Waiting for input');
    expect(runStatusBadgeClass('running')).toContain('sky');
    expect(runStatusBadgeClass('failed')).toContain('red');
  });
});
