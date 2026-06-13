import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJobAgentGraph,
  fetchJobDetails,
  fetchJobEvents,
  fetchJobs,
  fetchWorkflowProgress,
  fetchSystemSummary,
  clearJobs,
  isServiceJob,
  addClusterNode,
  benchmarkRuntimeModel,
  fetchRuntimeModels,
  removeClusterNode,
  streamWorkflowProgress,
} from '../api';

const mockApi = vi.hoisted(() => ({
  defaults: {
    baseURL: '/api/v1',
    headers: { common: {} as Record<string, string> },
  },
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
    vi.unstubAllGlobals();
  });

  it('normalizes sparse job list records with safe defaults', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        data: [
          { job_id: 'job-1', graph_id: 'graph-1', recovery_status: null },
          { status: 'running' },
        ],
      },
    });

    await expect(fetchJobs()).resolves.toEqual([
      expect.objectContaining({
        job_id: 'job-1',
        graph_id: 'graph-1',
        recovery_status: null,
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

  it('passes the terminal job visibility flag when requested', async () => {
    mockApi.get.mockResolvedValue({ data: { data: [] } });

    await expect(fetchJobs({ includeTerminal: false })).resolves.toEqual([]);

    expect(mockApi.get).toHaveBeenCalledWith('/jobs', {
      params: { include_terminal: false },
    });
  });

  it('clears jobs through the slash cleanup endpoint', async () => {
    mockApi.post.mockResolvedValue({ data: { cleared_count: 2 } });

    await expect(clearJobs()).resolves.toEqual({ cleared_count: 2 });

    expect(mockApi.post).toHaveBeenCalledWith('/jobs/cleanup');
  });

  it('reconciles stale paused service rows with live workflow progress', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              job_id: 'service-job-1',
              graph_id: 'video_watch_assistant_v1',
              status: 'paused',
              job_type: 'service',
              'live?': true,
              recovery_status: 'paused_for_review',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          schema_version: 1,
          job_id: 'service-job-1',
          workflow_id: 'video_watch_assistant_v1',
          name: 'Video Watch Assistant',
          status: 'running',
          workflow_kind: 'service',
        },
      });

    await expect(fetchJobs()).resolves.toEqual([
      expect.objectContaining({
        job_id: 'service-job-1',
        status: 'running',
      }),
    ]);
    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/jobs');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/jobs/service-job-1/workflow-progress');
  });

  it('reconciles stale paused batch rows with live workflow progress', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              job_id: 'batch-job-1',
              graph_id: 'personal_income_tax_expert_v1',
              status: 'paused',
              job_type: 'batch',
              recovery_status: 'paused_for_review',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          schema_version: 1,
          job_id: 'batch-job-1',
          workflow_id: 'personal_income_tax_expert_v1',
          name: 'Personal Income Tax Expert',
          status: 'running',
          workflow_kind: 'batch',
        },
      });

    await expect(fetchJobs()).resolves.toEqual([
      expect.objectContaining({
        job_id: 'batch-job-1',
        status: 'running',
      }),
    ]);
    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/jobs');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/jobs/batch-job-1/workflow-progress');
  });

  it('refreshes active list row statuses from live workflow progress', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              job_id: 'job-1',
              graph_id: 'workflow_v1',
              status: 'running',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          schema_version: 1,
          job_id: 'job-1',
          workflow_id: 'workflow_v1',
          name: 'Workflow',
          status: 'completed',
          workflow_kind: 'batch',
        },
      });

    await expect(fetchJobs()).resolves.toEqual([
      expect.objectContaining({
        job_id: 'job-1',
        status: 'completed',
      }),
    ]);
    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/jobs');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/jobs/job-1/workflow-progress');
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

  it('adds cluster nodes through the system cluster endpoint', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        ok: true,
        host: '10.0.0.42',
        node_name: 'mirror_neuron@10.0.0.42',
        status: 'connected',
      },
    });

    await expect(addClusterNode({ host: '10.0.0.42', token: 'join-token' })).resolves.toEqual(
      expect.objectContaining({
        host: '10.0.0.42',
        node_name: 'mirror_neuron@10.0.0.42',
        status: 'connected',
      }),
    );
    expect(mockApi.post).toHaveBeenCalledWith('/system/cluster/nodes:add', { host: '10.0.0.42', token: 'join-token' });
  });

  it('removes cluster nodes through the system cluster endpoint', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        ok: true,
        node_name: 'mirror_neuron@10.0.0.42',
        status: 'disconnected',
      },
    });

    await expect(removeClusterNode('mirror_neuron@10.0.0.42')).resolves.toEqual(
      expect.objectContaining({
        node_name: 'mirror_neuron@10.0.0.42',
        status: 'disconnected',
      }),
    );
    expect(mockApi.post).toHaveBeenCalledWith('/system/cluster/nodes:remove', { node_name: 'mirror_neuron@10.0.0.42' });
  });

  it('fetches installed runtime models', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        node: 'mn1@local',
        runner_available: true,
        models: [
          {
            id: 'gemma4:e2b',
            name: 'Gemma 4 E2B',
            docker_model: 'ai/gemma4:E2B',
            model: 'ai/gemma4:E2B',
            backend: 'llama.cpp',
            installed: true,
            node: 'mn1@local',
          },
        ],
      },
    });

    await expect(fetchRuntimeModels()).resolves.toEqual(
      expect.objectContaining({
        node: 'mn1@local',
        models: [
          expect.objectContaining({
            id: 'gemma4:e2b',
            docker_model: 'ai/gemma4:E2B',
          }),
        ],
      }),
    );
    expect(mockApi.get).toHaveBeenCalledWith('/models');
  });

  it('benchmarks runtime models through the encoded model route', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        model: 'gemma4:e2b',
        docker_model: 'ai/gemma4:E2B',
        node: 'mn1@local',
        elapsed_ms: 1200,
        first_token_ms: 340,
        generated_tokens: 15,
        tokens_per_second: 12.5,
        sample: 'Ready now.',
      },
    });

    await expect(benchmarkRuntimeModel('gemma4:e2b', { max_tokens: 32 })).resolves.toEqual(
      expect.objectContaining({
        model: 'gemma4:e2b',
        tokens_per_second: 12.5,
      }),
    );
    expect(mockApi.post).toHaveBeenCalledWith('/models/gemma4%3Ae2b/benchmark', { max_tokens: 32 });
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

  it('preserves compact paused job details with nullable graph metadata', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        job: {
          job_id: 'job-1',
          graph_id: null,
          run_id: 'run-1',
          status: 'paused',
          submitted_at: '2026-06-02T15:41:54Z',
          updated_at: null,
        },
        summary: {
          mode: 'compact',
          graph_id: null,
          status: 'paused',
        },
        agents: [],
        recent_events: [],
      },
    });

    await expect(fetchJobDetails('job-1')).resolves.toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          job_id: 'job-1',
          graph_id: null,
          run_id: 'run-1',
          status: 'paused',
          updated_at: null,
        }),
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

  it('skips malformed workflow progress stream snapshots and keeps reading', async () => {
    const snapshot = JSON.stringify({
      job_id: 'job-1',
      workflow_id: 'workflow-1',
      name: 'Workflow One',
      status: 'running',
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: snapshot\ndata: {bad json}\n\n`));
        controller.enqueue(new TextEncoder().encode(`event: snapshot\ndata: ${snapshot}\n\n`));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body,
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSnapshot = vi.fn();

    await streamWorkflowProgress('job-1', onSnapshot);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/jobs/job-1/workflow-progress/stream', {
      headers: {},
      signal: undefined,
    });
    expect(console.error).toHaveBeenCalledWith(
      'streamWorkflowProgress(job-1) JSON parse failed:',
      expect.any(SyntaxError),
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      job_id: 'job-1',
      workflow_id: 'workflow-1',
      status: 'running',
    }));
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
