import { describe, expect, it } from 'vitest';
import { formatElapsed } from '../utils/workflowProgress';

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
