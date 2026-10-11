import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBlueprints, fetchJobDetails, fetchJobEvents, fetchRuntimeModels,
  fetchSystemSummary, benchmarkRuntimeModel, launchBlueprintJob, resetStableJobData, startStableJobRun,
  WorkflowProgressSchema,
} from '../api';
import { collectPages } from '../api/parsing';
import { waitForOperation } from '../api/operations';
import { applyWorkflowShape } from '../api/workflowShape';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: client, getApiBaseUrl: () => '/api/v1', getAuthHeader: () => ({}) }));

describe('current API compatibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('keeps durable job, execution and output identities separate', async () => {
    client.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/monitor')) return { data: { run_id: 'execution-1', job: { job_id: 'execution-1', run_id: 'output-1', status: 'running' } } };
      if (path === '/runs/execution-1') return { data: { run_id: 'execution-1', job_id: 'stable-1', status: 'running' } };
      throw new Error('No workflow shape');
    });
    expect(await fetchJobDetails('execution-1')).toMatchObject({ job_id: 'stable-1', execution_id: 'execution-1', runtime_run_id: 'output-1' });
  });

  it.each([
    ['models', fetchRuntimeModels, { installed_only: true, page_token: 'second' }],
    ['blueprints', fetchBlueprints, { page_token: 'second' }],
    ['events', () => fetchJobEvents('execution-1'), { page_token: 'second' }],
  ])('follows all %s pages', async (kind, load, params) => {
    const row = kind === 'models' ? { id: 'model-1' } : kind === 'blueprints' ? { id: 'blueprint-1' } : { type: 'event-1' };
    client.get.mockResolvedValueOnce({ data: { items: [row], next_page_token: 'second' } })
      .mockResolvedValueOnce({ data: { items: [row], next_page_token: null } });
    const result = await load();
    expect(Array.isArray(result) ? result : result.items).toHaveLength(2);
    expect(client.get.mock.calls[1][1]).toEqual({ params });
  });

  it('rejects a cursor loop rather than claiming a complete catalog', async () => {
    await expect(collectPages(async () => ({ items: [], next_page_token: 'again' }), 'Catalog')).rejects.toThrow('repeated a page token');
  });

  it('preserves ZIP configuration and both stage identities across retries', async () => {
    client.post.mockImplementation(async (path: string) => ({ data: path === '/jobs' ? { job_id: 'bundle-job' } : { run_id: 'bundle-execution' } }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await launchBlueprintJob({ source: 'bundle', bundle_id: 'bundle-1', config_overrides: { mode: 'review', limit: 5 } }, { idempotencyKey: 'reviewed-launch' });
    }
    expect(client.post.mock.calls[0][1]).toEqual({ bundle_id: 'bundle-1', resolved_configuration: { mode: 'review', limit: 5 } });
    expect(client.post.mock.calls[1]).toEqual(client.post.mock.calls[3]);
    expect(client.post.mock.calls[1][2].headers['Idempotency-Key']).toBe('reviewed-launch');
  });

  it('replacement retries send the same fresh run identity and body', async () => {
    client.post.mockResolvedValue({ data: { run_id: 'replacement' } });
    await startStableJobRun('service', {}, true, 'replace-once');
    await startStableJobRun('service', {}, true, 'replace-once');
    expect(client.post.mock.calls[0]).toEqual(client.post.mock.calls[1]);
  });

  it('waits for an accepted reset to actually complete', async () => {
    vi.useFakeTimers();
    client.post.mockResolvedValue({ data: { operation_id: 'op-1', status: 'running' } });
    client.get.mockResolvedValueOnce({ data: { operation_id: 'op-1', status: 'running' } })
      .mockResolvedValueOnce({ data: { operation_id: 'op-1', status: 'completed' } });
    let complete = false;
    const task = resetStableJobData('job-1').then(() => { complete = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(complete).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    await task;
    expect(complete).toBe(true);
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('reports asynchronous failure and bounded pending states', async () => {
    const pending = { operation_id: 'op-1', kind: 'reset_job_data', status: 'running', counters: { total: 0, started: 0, finished: 0, succeeded: 0, failed: 0, deferred: 0 } };
    await expect(waitForOperation({ ...pending, status: 'failed', error: { detail: 'Reset rejected' } }, vi.fn())).rejects.toThrow('Reset rejected');
    await expect(waitForOperation(pending, vi.fn(), { timeoutMs: 0 })).rejects.toThrow('still pending');
  });

  it('rejects invalid collections and summary data without reporting empty success', async () => {
    client.get.mockResolvedValue({ data: { detail: 'invalid', secret: 'do-not-log' } });
    await expect(fetchRuntimeModels()).rejects.toThrow('invalid data');
    await expect(fetchSystemSummary()).rejects.toThrow('invalid data');
    client.post.mockResolvedValue({ data: { detail: 'invalid', secret: 'do-not-log' } });
    await expect(benchmarkRuntimeModel('model-1')).rejects.toThrow('invalid data');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('do-not-log');
    expect(WorkflowProgressSchema.safeParse({ detail: 'invalid' }).success).toBe(false);
  });

  it('merges the separate workflow identity and topology resources with progress', () => {
    const progress = WorkflowProgressSchema.parse({ job_id: 'execution-1', status: 'running', steps: [{ id: 'watch', status: 'running', agents: [{ id: 'watcher', status: 'running' }] }] });
    const projected = applyWorkflowShape(progress, {
      job_id: 'stable-1', run_id: 'execution-1', source: 'latest_run', workflow_id: 'watch-workflow', graph_revision: 2, type: 'service',
      steps: [{ id: 'watch', label: 'Watch for changes', goal: 'Review updates', agents: [{ id: 'watcher', display_name: 'Reviewer', role: 'Review', model: 'configured-model' }] }],
      edges: [], layers: [['watch']],
    });
    expect(projected.workflow_kind).toBe('service');
    expect(projected.steps[0]).toMatchObject({ label: 'Watch for changes', goal: 'Review updates', status: 'running', agents: [{ display_name: 'Reviewer', model: 'configured-model', status: 'running' }] });
    expect(projected.layers).toEqual([['watch']]);
  });
});
