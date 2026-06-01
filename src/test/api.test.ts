import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJobAgentGraph,
  fetchJobDetails,
  fetchJobEvents,
  fetchJobs,
  fetchWorkflowProgress,
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

  it('parses workflow progress snapshots', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        job_id: 'job-1',
        workflow_id: 'workflow-1',
        name: 'Workflow One',
        status: 'running',
        workflow_kind: 'service',
        agent_count: { done: 1, total: 2 },
        current_step_id: 'research',
        current_step_ids: ['research'],
        edges: [{ from: 'intake', to: 'research', event: 'intake_ready' }],
        layers: [['intake'], ['research']],
        steps: [
          {
            id: 'research',
            label: 'Research',
            status: 'running',
            current: true,
            parents: ['intake'],
            children: [],
            layer: 1,
            done_count: 1,
            ready_count: 2,
            total_count: 2,
            agents: [{ id: 'research:docs', status: 'idle', progress: 0.2, live: true }],
          },
        ],
      },
    });

    await expect(fetchWorkflowProgress('job-1')).resolves.toEqual(
      expect.objectContaining({
        job_id: 'job-1',
        workflow_id: 'workflow-1',
        workflow_kind: 'service',
        current_step_ids: ['research'],
        edges: [{ from: 'intake', to: 'research', event: 'intake_ready' }],
        layers: [['intake'], ['research']],
        steps: [
          expect.objectContaining({
            id: 'research',
            parents: ['intake'],
            layer: 1,
            agents: [expect.objectContaining({ id: 'research:docs', status: 'idle', live: true })],
          }),
        ],
      }),
    );
    expect(mockApi.get).toHaveBeenCalledWith('/jobs/job-1/workflow-progress');
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

  it('detects live stream policies as service jobs', () => {
    expect(isServiceJob({ job_id: 'watcher', graph_id: 'stream' }, { stream_mode: 'live' })).toBe(true);
    expect(isServiceJob({ job_id: 'watcher', graph_id: 'stream' }, { policies: { stream_mode: 'live' } })).toBe(true);
  });

  it('does not mark normal batch jobs as service jobs by name', () => {
    expect(isServiceJob({ job_id: 'price-monitor', graph_id: 'stream' })).toBe(false);
    expect(isServiceJob({ job_id: 'job-1', graph_id: 'batch-flow' })).toBe(false);
    expect(isServiceJob(null)).toBe(false);
  });
});
