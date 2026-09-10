import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { pageTokenFrom, parseOrFallback, parseOrThrow, ValidationError } from '../api/parsing';
import { jobPath, routeId, runPath } from '../api/routes';
import { resolveApiBaseUrl } from '../config/browser';

describe('route ids', () => {
  it('rejects empty or whitespace ids instead of building broken paths', () => {
    expect(() => routeId('')).toThrow('non-empty id');
    expect(() => routeId('   ')).toThrow('non-empty id');
    expect(() => jobPath('')).toThrow();
    expect(() => runPath('', '/events/stream')).toThrow();
  });

  it('encodes non-empty ids', () => {
    expect(jobPath('run/with space')).toBe('/jobs/run%2Fwith%20space');
  });
});

describe('resolveApiBaseUrl', () => {
  it('normalizes same-origin paths', () => {
    expect(resolveApiBaseUrl('/api/v1/')).toBe('/api/v1');
  });

  it('rejects empty, whitespace, and absolute URLs to avoid token leakage', () => {
    expect(() => resolveApiBaseUrl('')).toThrow();
    expect(() => resolveApiBaseUrl('   ')).toThrow();
    expect(() => resolveApiBaseUrl('https://evil.test/api')).toThrow();
    expect(() => resolveApiBaseUrl('api/v1')).toThrow();
  });
});

describe('parsing helpers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a labeled ValidationError when both payload and fallback are invalid', () => {
    const schema = z.object({ job_id: z.string() });
    expect(() => parseOrFallback(schema, { bogus: 1 }, { also: 'bogus' }, 'fetchThing(1)')).toThrow(ValidationError);
  });

  it('parseOrThrow rejects invalid network data instead of crashing the view', () => {
    const schema = z.object({ run_id: z.string() });
    expect(() => parseOrThrow(schema, { run_id: 42 }, 'fetchStableRun(x)')).toThrow(/fetchStableRun\(x\)/);
    expect(parseOrThrow(schema, { run_id: 'run-1' }, 'fetchStableRun(x)')).toEqual({ run_id: 'run-1' });
  });

  it('pageTokenFrom returns null for non-string tokens with a diagnostic', () => {
    expect(pageTokenFrom({ next_page_token: 42 })).toBeNull();
    expect(pageTokenFrom({ next_page_token: 'opaque' })).toBe('opaque');
    expect(pageTokenFrom(null)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
