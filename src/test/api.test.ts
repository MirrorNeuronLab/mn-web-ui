import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJobAgentGraph,
  fetchJobDetails,
  fetchJobEvents,
  fetchJobs,
  fetchSystemSummary,
  isServiceJob,
} from '../api';

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: mockApi,
}));

describe('api parsing helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes sparse job list records with safe defaults', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        data: [
          { job_id: 'job-1', graph_id: 'graph-1' },
          { status: 'running' },
        ],
      },
    });

    await expect(fetchJobs()).resolves.toEqual([
      expect.objectContaining({
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'unknown',
      }),
      expect.objectContaining({
        job_id: 'unknown',
        graph_id: 'unknown',
        status: 'running',
      }),
    ]);
    expect(mockApi.get).toHaveBeenCalledWith('/jobs');
  });

  it('falls back to an empty job list when the API shape is malformed', async () => {
    mockApi.get.mockResolvedValue({
      data: { data: [{ job_id: 123, status: 'running' }] },
    });

    await expect(fetchJobs()).resolves.toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      'fetchJobs validation failed:',
      expect.anything(),
    );
  });

  it('returns structured defaults when system summary validation fails', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        nodes: [{ name: 42 }],
        jobs: 'not-a-list',
      },
    });

    await expect(fetchSystemSummary()).resolves.toEqual({ nodes: [], jobs: [] });
  });

  it('keeps job detail screens renderable when the detail payload is malformed', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        job: { job_id: 123 },
        agents: {},
      },
    });

    await expect(fetchJobDetails('job-1')).resolves.toEqual(
      expect.objectContaining({
        job: expect.objectContaining({ job_id: 'job-1', status: 'unknown' }),
        agents: [],
      }),
    );
  });

  it('preserves blueprint web ui handles on job detail payloads', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        job: { job_id: 'job-1', status: 'running' },
        web_ui: {
          url: 'http://localhost:61000',
          title: 'Blueprint Dashboard',
          status: 'running',
        },
      },
    });

    await expect(fetchJobDetails('job-1')).resolves.toEqual(
      expect.objectContaining({
        web_ui: expect.objectContaining({
          url: 'http://localhost:61000',
          title: 'Blueprint Dashboard',
          status: 'running',
        }),
      }),
    );
  });

  it('drops malformed event streams instead of surfacing partial bad data', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        data: [
          { timestamp: '2026-04-16T12:00:00Z', type: 'agent_started' },
          { timestamp: 123, type: 'agent_completed' },
        ],
      },
    });

    await expect(fetchJobEvents('job-1')).resolves.toEqual([]);
  });

  it('falls back to an empty agent graph when graph validation fails', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        job_id: 'job-1',
        nodes: [{ label: 'missing id' }],
        edges: [],
      },
    });

    await expect(fetchJobAgentGraph('job-1')).resolves.toEqual(
      expect.objectContaining({
        job_id: 'job-1',
        nodes: [],
        edges: [],
        stats: { agent_count: 0, edge_count: 0, message_count: 0, event_count: 0 },
      }),
    );
  });
});

describe('isServiceJob', () => {
  it('detects explicit service summaries', () => {
    expect(isServiceJob({ job_id: 'batch-job', graph_id: 'daily-run' }, { job_type: 'service' })).toBe(true);
  });

  it('detects service jobs from job fields', () => {
    expect(isServiceJob({ job_id: 'price-monitor', graph_id: 'stream', type: 'service' })).toBe(true);
    expect(isServiceJob({ job_id: 'job-1', graph_id: 'batch-flow', job_type: 'service' })).toBe(true);
  });

  it('does not mark normal batch jobs as service jobs by name', () => {
    expect(isServiceJob({ job_id: 'price-monitor', graph_id: 'stream' })).toBe(false);
    expect(isServiceJob({ job_id: 'job-1', graph_id: 'batch-flow' })).toBe(false);
    expect(isServiceJob(null)).toBe(false);
  });
});
