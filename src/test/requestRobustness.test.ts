import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  addClusterNode,
  launchBlueprintJob,
  newIdempotencyKey,
  MissingEtagError,
  resetStableJobData,
} from '../api';
import { ValidationError } from '../api/parsing';

const mockApi = vi.hoisted(() => ({
  defaults: {
    baseURL: '/api/v1',
    headers: { common: {} as Record<string, string> },
  },
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../api/client', () => ({ default: mockApi, getApiBaseUrl: () => '/api/v1', getAuthHeader: () => ({}) }));

describe('request robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('generates an idempotency key without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {});
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(second).not.toBe(first);
  });

  it('reuses a caller-supplied idempotency key across retries', async () => {
    mockApi.post.mockResolvedValue({ data: { operation_id: 'op-1', status: 'running' } });
    await resetStableJobData('job-1', 'fixed-key');
    await resetStableJobData('job-1', 'fixed-key');
    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/jobs/job-1/data-resets', {}, {
      headers: { 'Idempotency-Key': 'fixed-key' },
    });
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/jobs/job-1/data-resets', {}, {
      headers: { 'Idempotency-Key': 'fixed-key' },
    });
  });

  it('validates outbound node payloads instead of posting raw input', async () => {
    expect(() => addClusterNode({ host: '  ', token: 't' })).toThrow();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('rejects invalid launch responses instead of synthesizing pending', async () => {
    mockApi.post.mockResolvedValue({ data: null });
    await expect(launchBlueprintJob({
      source: 'catalog',
      blueprint_id: 'researcher',
      config_overrides: {},
    })).rejects.toThrow(ValidationError);
  });

  it('MissingEtagError explains the failed action with a next step', () => {
    const error = new MissingEtagError('archiving');
    expect(error.message).toMatch(/archiving/);
    expect(error.message).toMatch(/Reload the job/);
  });
});
