import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addClusterNode,
  archiveStableJob,
  cancelAllJobs,
  cancelRun,
  clearJobs,
  deleteStableJob,
  fetchJobEvents,
  fetchRuns,
  fetchRuntimeModels,
  fetchStableJobRuns,
  fetchStableJobs,
  launchBlueprintJob,
  pauseRun,
  removeClusterNode,
  resumeRun,
  startStableJobRun,
  uploadBundle,
} from '../api';

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

vi.mock('../api/client', () => ({ default: mockApi }));

describe('canonical REST v1 client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('crypto', { randomUUID: () => 'idem-test-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads runs as a paginated collection and preserves the continuation token', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        items: [{ run_id: 'run-1', graph_id: 'graph-1', status: 'running' }],
        next_page_token: 'opaque-next',
      },
    });

    await expect(fetchRuns({ includeTerminal: false, pageSize: 20, pageToken: 'opaque-current' }))
      .resolves.toEqual({
        items: [expect.objectContaining({ run_id: 'run-1', status: 'running' })],
        next_page_token: 'opaque-next',
      });
    expect(mockApi.get).toHaveBeenCalledWith('/runs', {
      params: {
        include_terminal: false,
        page_size: 20,
        page_token: 'opaque-current',
      },
    });
  });

  it('drops malformed rows without restoring legacy envelopes', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        items: [
          { run_id: 'valid-run', status: 'running' },
          { run_id: 42, status: 'running' },
        ],
        next_page_token: null,
      },
    });
    await expect(fetchRuns()).resolves.toEqual({
      items: [expect.objectContaining({ run_id: 'valid-run' })],
      next_page_token: null,
    });
  });

  it('pages persistent jobs and their run history', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          items: [{ job_id: 'job-1', status: 'active', data_generation: 1 }],
          next_page_token: 'jobs-next',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ run_id: 'run-1', job_id: 'job-1', status: 'completed', attempt: 1 }],
          next_page_token: null,
        },
      });

    await expect(fetchStableJobs({ includeArchived: true, pageToken: 'jobs-page' })).resolves.toEqual({
      items: [expect.objectContaining({ job_id: 'job-1' })],
      next_page_token: 'jobs-next',
    });
    await expect(fetchStableJobRuns('job-1', 'runs-page')).resolves.toEqual({
      items: [expect.objectContaining({ run_id: 'run-1' })],
      next_page_token: null,
    });
    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/jobs', {
      params: { include_archived: true, page_size: undefined, page_token: 'jobs-page' },
    });
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/jobs/job-1/runs', {
      params: { page_token: 'runs-page' },
    });
  });

  it('always supplies an idempotency key when creating a run', async () => {
    mockApi.post.mockResolvedValue({ data: { run_id: 'run-new', job_id: 'job-1', status: 'pending' } });
    await expect(startStableJobRun('job-1', { query: 'test' })).resolves.toEqual(
      expect.objectContaining({ run_id: 'run-new' }),
    );
    expect(mockApi.post).toHaveBeenCalledWith('/jobs/job-1/runs', {
      inputs: { query: 'test' },
      replace_existing_run: false,
    }, {
      headers: { 'Idempotency-Key': 'idem-test-key' },
    });

    await startStableJobRun('job-1', {}, true);
    expect(mockApi.post).toHaveBeenLastCalledWith('/jobs/job-1/runs', {
      inputs: {},
      replace_existing_run: true,
      run_id: 'service-idem-test-key',
    }, {
      headers: { 'Idempotency-Key': 'idem-test-key' },
    });
  });

  it('fetches and retains an ETag before conditionally archiving and deleting a job', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { job_id: 'job-etag-1', status: 'active' }, headers: { etag: '"rev-1"' } })
      .mockResolvedValueOnce({ data: { job_id: 'job-etag-2', status: 'active' }, headers: { etag: '"rev-8"' } });
    mockApi.patch.mockResolvedValue({
      data: { job_id: 'job-etag-1', status: 'archived' },
      headers: { etag: '"rev-2"' },
    });
    mockApi.delete.mockResolvedValue({ status: 204, data: undefined });

    await archiveStableJob('job-etag-1');
    await deleteStableJob('job-etag-2');

    expect(mockApi.patch).toHaveBeenCalledWith('/jobs/job-etag-1', { status: 'archived' }, {
      headers: { 'If-Match': '"rev-1"' },
    });
    expect(mockApi.delete).toHaveBeenCalledWith('/jobs/job-etag-2', {
      headers: { 'If-Match': '"rev-8"' },
    });
  });

  it('uses desired-state PATCH for run lifecycle changes', async () => {
    mockApi.patch
      .mockResolvedValueOnce({ data: { run_id: 'run-1', status: 'paused' } })
      .mockResolvedValueOnce({ data: { run_id: 'run-1', status: 'running' } })
      .mockResolvedValueOnce({ data: { run_id: 'run-1', status: 'cancelled' } });
    await pauseRun('run-1');
    await resumeRun('run-1');
    await cancelRun('run-1');
    expect(mockApi.patch).toHaveBeenNthCalledWith(1, '/runs/run-1', { desired_state: 'paused' });
    expect(mockApi.patch).toHaveBeenNthCalledWith(2, '/runs/run-1', { desired_state: 'running' });
    expect(mockApi.patch).toHaveBeenNthCalledWith(3, '/runs/run-1', { desired_state: 'cancelled' });
  });

  it('uses paginated run events instead of runtime-run aliases', async () => {
    mockApi.get.mockResolvedValue({
      data: { items: [{ type: 'agent.completed', timestamp: '2026-08-13T00:00:00Z' }], next_page_token: null },
    });
    await expect(fetchJobEvents('run/with space')).resolves.toEqual([
      expect.objectContaining({ type: 'agent.completed' }),
    ]);
    expect(mockApi.get).toHaveBeenCalledWith('/runs/run%2Fwith%20space/events');
  });

  it('starts administrative operations through noun resources with idempotency', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: { operation_id: 'op-clean', kind: 'clear_jobs', status: 'running' } })
      .mockResolvedValueOnce({ data: { operation_id: 'op-cancel', kind: 'cancel_all_jobs', status: 'running' } });
    await clearJobs();
    await cancelAllJobs();
    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/run-cleanups', {}, {
      headers: { 'Idempotency-Key': 'idem-test-key' },
    });
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/run-cancellations', {}, {
      headers: { 'Idempotency-Key': 'idem-test-key' },
    });
  });

  it('creates blueprint runs directly and rejects public host paths', async () => {
    mockApi.post.mockResolvedValue({ data: { run_id: 'run-blueprint', job_id: 'job-blueprint', status: 'pending' } });
    await expect(launchBlueprintJob({
      source: 'catalog',
      blueprint_id: 'researcher',
      config_overrides: { mode: 'safe' },
    })).resolves.toEqual(expect.objectContaining({ run_id: 'run-blueprint' }));
    expect(mockApi.post).toHaveBeenCalledWith('/blueprints/researcher/runs', {
      config_overrides: { mode: 'safe' },
    }, { headers: { 'Idempotency-Key': 'idem-test-key' } });
    await expect(launchBlueprintJob({ source: 'path', path: '/tmp/private' })).rejects.toThrow(
      'Host filesystem paths are not accepted',
    );
  });

  it('uploads multipart bundles and retains only the opaque bundle identity', async () => {
    mockApi.post.mockResolvedValue({ data: { bundle_id: 'bundle_01JABC' } });
    const file = new File(['bundle'], 'worker.zip', { type: 'application/zip' });
    await expect(uploadBundle(file)).resolves.toEqual({ bundle_id: 'bundle_01JABC' });
    expect(mockApi.post).toHaveBeenCalledWith('/bundles', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  });

  it('uses canonical infrastructure resources and paginated models', async () => {
    mockApi.post.mockResolvedValue({ data: { ok: true, node_name: 'mn@10.0.0.2', status: 'connected' } });
    mockApi.delete.mockResolvedValue({ data: { ok: true, node_name: 'mn@10.0.0.2', status: 'deleted' } });
    mockApi.get.mockResolvedValue({ data: { items: [], next_page_token: null } });
    await addClusterNode({ host: '10.0.0.2', token: 'join-token' });
    await removeClusterNode('mn@10.0.0.2');
    await expect(fetchRuntimeModels()).resolves.toEqual(expect.objectContaining({ items: [], next_page_token: null }));
    expect(mockApi.post).toHaveBeenCalledWith('/nodes', { host: '10.0.0.2', token: 'join-token' });
    expect(mockApi.delete).toHaveBeenCalledWith('/nodes/mn%4010.0.0.2');
    expect(mockApi.get).toHaveBeenCalledWith('/models');
  });
});
