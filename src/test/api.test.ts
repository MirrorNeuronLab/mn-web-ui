import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJobAgentGraph,
  fetchJobDetails,
  fetchJobEvents,
  fetchJobs,
  fetchWorkflowProgress,
  fetchSystemSummary,
  clearJobs,
  cancelJob,
  isServiceJob,
  addClusterNode,
  benchmarkRuntimeModel,
  fetchLaunchProgress,
  fetchRuntimeModels,
  launchBlueprintJob,
  removeClusterNode,
  pauseJob,
  resumeJob,
  revealArtifact,
  streamWorkflowProgress,
  uploadBundle,
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

  it('accepts jobs from the backend jobs envelope', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        jobs: [
          {
            job_id: 'job-envelope-1',
            graph_id: 'graph-envelope',
            status: 'completed',
          },
        ],
      },
    });

    await expect(fetchJobs()).resolves.toEqual([
      expect.objectContaining({
        job_id: 'job-envelope-1',
        graph_id: 'graph-envelope',
        status: 'completed',
      }),
    ]);
  });

  it('clears jobs through the slash cleanup endpoint', async () => {
    mockApi.post.mockResolvedValue({ data: { cleared_count: 2 } });

    await expect(clearJobs()).resolves.toEqual({ version: 1, cleared_count: 2 });

    expect(mockApi.post).toHaveBeenCalledWith('/jobs/cleanup');
  });

  it('uses safe fallbacks for malformed mutation responses', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { cleared_count: 'two' } });
    await expect(clearJobs()).resolves.toEqual({ version: 1, cleared_count: 0 });

    mockApi.post.mockResolvedValueOnce({ data: { status: 42 } });
    await expect(cancelJob('job-1')).resolves.toEqual(expect.objectContaining({
      job_id: 'job-1',
      status: 'cancelled',
    }));

    mockApi.post.mockResolvedValueOnce({ data: { status: null } });
    await expect(pauseJob('job-1')).resolves.toEqual(expect.objectContaining({
      job_id: 'job-1',
      status: 'paused',
    }));

    mockApi.post.mockResolvedValueOnce({ data: { status: false } });
    await expect(resumeJob('job-1')).resolves.toEqual(expect.objectContaining({
      job_id: 'job-1',
      status: 'running',
    }));
  });

  it('encodes dynamic job ids before building routes', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: { job: { job_id: 'job/with space', status: 'running' } },
    });
    await fetchJobDetails('job/with space');
    expect(mockApi.get).toHaveBeenLastCalledWith('/jobs/job%2Fwith%20space');

    mockApi.get.mockResolvedValueOnce({ data: { data: [] } });
    await fetchJobEvents('job/with space');
    expect(mockApi.get).toHaveBeenLastCalledWith('/jobs/job%2Fwith%20space/events');

    mockApi.get.mockResolvedValueOnce({
      data: { job_id: 'job/with space', nodes: [], edges: [] },
    });
    await fetchJobAgentGraph('job/with space');
    expect(mockApi.get).toHaveBeenLastCalledWith('/jobs/job%2Fwith%20space/agent-graph');

    mockApi.post.mockResolvedValueOnce({ data: { status: 'paused' } });
    await pauseJob('job/with space');
    expect(mockApi.post).toHaveBeenLastCalledWith('/jobs/job%2Fwith%20space/pause');
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

    await expect(fetchSystemSummary()).resolves.toEqual({ version: 1, nodes: [], jobs: [] });
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
    expect(mockApi.post).toHaveBeenCalledWith('/system/cluster/nodes:add', { version: 1, host: '10.0.0.42', token: 'join-token' });
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
    expect(mockApi.post).toHaveBeenCalledWith('/system/cluster/nodes:remove', { version: 1, node_name: 'mirror_neuron@10.0.0.42' });
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
    expect(mockApi.post).toHaveBeenCalledWith('/models/gemma4%3Ae2b/benchmark', { version: 1, max_tokens: 32 });
  });

  it('posts catalog blueprint launches to the encoded catalog run endpoint', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        job_id: 'job-vc-1',
        id: 'job-vc-1',
        run_id: 'run-vc-1',
        status: 'pending',
        progress_id: 'progress-vc-1',
      },
    });

    await expect(launchBlueprintJob({
      source: 'catalog',
      blueprint_id: 'vc_assistant',
      progress_id: 'progress-vc-1',
      run_id: 'run-vc-1',
      config_overrides: { llm: { model: 'local' } },
      force: true,
      fake_llm: false,
      fake_skills: true,
    })).resolves.toEqual(expect.objectContaining({
      job_id: 'job-vc-1',
      run_id: 'run-vc-1',
      progress_id: 'progress-vc-1',
    }));

    expect(mockApi.post).toHaveBeenCalledWith('/blueprints/vc_assistant/runs', {
      version: 1,
      progress_id: 'progress-vc-1',
      run_id: 'run-vc-1',
      config_overrides: { llm: { model: 'local' } },
      force: true,
      fake_llm: false,
      fake_skills: true,
    });
  });

  it('keeps path and bundle launches on the generic launch endpoint', async () => {
    mockApi.post
      .mockResolvedValueOnce({
        data: {
          status: 'launching',
          job_id: null,
          run_id: 'run-path-1',
          progress_id: 'progress-path-1',
        },
      })
      .mockResolvedValueOnce({
        data: {
          status: 'launching',
          job_id: null,
          run_id: 'run-bundle-1',
          progress_id: 'progress-bundle-1',
        },
      });

    await expect(launchBlueprintJob({
      source: 'path',
      path: '/tmp/blueprints/vc_assistant',
      progress_id: 'progress-path-1',
    })).resolves.toEqual(expect.objectContaining({
      status: 'launching',
      job_id: null,
      progress_id: 'progress-path-1',
    }));

    await expect(launchBlueprintJob({
      source: 'bundle',
      _bundle_path: '/tmp/bundle',
      progress_id: 'progress-bundle-1',
    })).resolves.toEqual(expect.objectContaining({
      status: 'launching',
      job_id: null,
      progress_id: 'progress-bundle-1',
    }));

    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/blueprints/launch/runs', {
      version: 1,
      source: 'path',
      path: '/tmp/blueprints/vc_assistant',
      progress_id: 'progress-path-1',
    });
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/blueprints/launch/runs', {
      version: 1,
      source: 'bundle',
      _bundle_path: '/tmp/bundle',
      progress_id: 'progress-bundle-1',
    });
  });

  it('preserves accepted async launch responses without a job id', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        status: 'launching',
        job_id: null,
        id: null,
        run_id: 'run-async-1',
        progress_id: 'progress-async-1',
        progress_url: '/api/v1/blueprints/launch/progress/progress-async-1',
      },
    });

    await expect(launchBlueprintJob({
      source: 'path',
      path: '/tmp/blueprints/vc_assistant',
      progress_id: 'progress-async-1',
    })).resolves.toEqual(expect.objectContaining({
      status: 'launching',
      job_id: null,
      id: null,
      run_id: 'run-async-1',
      progress_id: 'progress-async-1',
      progress_url: '/api/v1/blueprints/launch/progress/progress-async-1',
    }));
    expect(console.error).not.toHaveBeenCalledWith(
      'launchBlueprintJob validation failed:',
      expect.anything(),
    );
  });

  it('parses launch progress snapshots with phases and job metadata', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        progress_id: 'progress-async-1',
        run_id: 'run-async-1',
        job_id: 'job-async-1',
        status: 'completed',
        current_phase: 'submit',
        phases: [
          { id: 'resolve_source', label: 'Resolve blueprint source', status: 'completed' },
          { id: 'submit', label: 'Submit job to runtime', status: 'completed', message: 'Job submitted.' },
        ],
        events: [
          { phase: 'submit', status: 'completed', message: 'Job submitted.' },
        ],
        latest: { phase: 'submit', status: 'completed', message: 'Job submitted.' },
        completed: true,
      },
    });

    await expect(fetchLaunchProgress('progress-async-1')).resolves.toEqual(expect.objectContaining({
      progress_id: 'progress-async-1',
      run_id: 'run-async-1',
      job_id: 'job-async-1',
      status: 'completed',
      current_phase: 'submit',
      phases: [
        expect.objectContaining({ id: 'resolve_source', status: 'completed' }),
        expect.objectContaining({ id: 'submit', status: 'completed', message: 'Job submitted.' }),
      ],
      events: [
        expect.objectContaining({ phase: 'submit', status: 'completed' }),
      ],
    }));
  });

  it('normalizes malformed upload and launch responses', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: {
        bundle_path: 42,
        manifest: 'not-a-manifest',
      },
    });

    const file = new File(['bundle'], 'bundle.zip', { type: 'application/zip' });
    await expect(uploadBundle(file)).resolves.toEqual({
      version: 1,
      bundle_path: '',
      manifest: {},
    });

    mockApi.post.mockResolvedValueOnce({
      data: {
        id: 123,
        status: 456,
      },
    });

    await expect(launchBlueprintJob({ source: 'path', path: '/tmp/bad-blueprint' })).resolves.toEqual({ version: 1, status: 'pending' });
    expect(console.error).toHaveBeenCalledWith(
      'launchBlueprintJob validation failed:',
      expect.anything(),
    );
  });

  it('posts reveal artifact calls through same-origin API paths only', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { ok: true, folder: '/tmp/job-1' } });

    await expect(revealArtifact('/api/v1/artifacts/logs/reveal')).resolves.toEqual(
      expect.objectContaining({ ok: true, folder: '/tmp/job-1' }),
    );
    expect(mockApi.post).toHaveBeenLastCalledWith('/artifacts/logs/reveal');

    await expect(revealArtifact('https://evil.example/artifacts/logs/reveal')).rejects.toThrow('same-origin');
    expect(mockApi.post).toHaveBeenCalledTimes(1);
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

  it('accepts job events from the backend events envelope', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        events: [
          {
            timestamp: '2026-04-16T12:00:00Z',
            type: 'job_running',
          },
        ],
      },
    });

    await expect(fetchJobEvents('job-1')).resolves.toEqual([
      expect.objectContaining({
        timestamp: '2026-04-16T12:00:00Z',
        type: 'job_running',
      }),
    ]);
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
        sequence: 7,
        status: 'running',
        progress_source: 'explicit',
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
            agents: [{
              id: 'research:docs',
              status: 'idle',
              progress: 0.2,
              progress_source: 'items',
              items_done: 2,
              items_total: 10,
              tokens_used: 300,
              token_budget: 1200,
              live: true,
            }],
          },
        ],
      },
    });

    await expect(fetchWorkflowProgress('job-1')).resolves.toEqual(
      expect.objectContaining({
        job_id: 'job-1',
        workflow_id: 'workflow-1',
        sequence: 7,
        progress_source: 'explicit',
        workflow_kind: 'service',
        current_step_ids: ['research'],
        edges: [{ from: 'intake', to: 'research', event: 'intake_ready' }],
        layers: [['intake'], ['research']],
        steps: [
          expect.objectContaining({
            id: 'research',
            parents: ['intake'],
            layer: 1,
            agents: [expect.objectContaining({
              id: 'research:docs',
              status: 'idle',
              progress_source: 'items',
              items_done: 2,
              items_total: 10,
              tokens_used: 300,
              token_budget: 1200,
              live: true,
            })],
          }),
        ],
      }),
    );
    expect(mockApi.get).toHaveBeenCalledWith('/jobs/job-1/workflow-progress');
  });

  it('skips malformed workflow progress stream snapshots and keeps reading', async () => {
    vi.stubGlobal('EventSource', undefined);
    const snapshot = JSON.stringify({
      job_id: 'job-1',
      workflow_id: 'workflow-1',
      name: 'Workflow One',
      status: 'running',
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: snapshot\ndata: {bad json}\n\n`));
        controller.enqueue(new TextEncoder().encode(`event: heartbeat\ndata: {"job_id":"job-1"}\n\n`));
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
    const onHeartbeat = vi.fn();

    await streamWorkflowProgress('job-1', onSnapshot, undefined, onHeartbeat);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/jobs/job-1/workflow-progress/stream', {
      headers: {},
      signal: undefined,
    });
    expect(console.error).toHaveBeenCalledWith(
      'streamWorkflowProgress(job-1) JSON parse failed:',
      expect.any(SyntaxError),
    );
    expect(onHeartbeat).toHaveBeenCalledTimes(1);
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
