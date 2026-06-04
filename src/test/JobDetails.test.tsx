import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { toast } from 'sonner';
import JobDetails from '../pages/JobDetails';
import { fetchJobDetails, fetchJobEvents, fetchJobAgentGraph, fetchRunUi, fetchWorkflowProgress, streamWorkflowProgress, cancelJob, pauseJob, resumeJob, revealArtifact } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchJobDetails: vi.fn(),
    fetchJobEvents: vi.fn(),
    fetchJobAgentGraph: vi.fn(),
    fetchRunUi: vi.fn(),
    fetchWorkflowProgress: vi.fn(),
    streamWorkflowProgress: vi.fn(),
    cancelJob: vi.fn(),
    pauseJob: vi.fn(),
    resumeJob: vi.fn(),
    revealArtifact: vi.fn(),
  };
});

// Mock ReactFlow because we can't test canvas elements easily in jsdom
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow-mock">Graph View{children}</div>,
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
  Panel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/jobs/:id" element={ui} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  );
};

describe('JobDetails Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
    vi.mocked(fetchJobAgentGraph).mockResolvedValue({
      job_id: 'test-job-1',
      status: 'unknown',
      nodes: [],
      edges: [],
      stats: { agent_count: 0, edge_count: 0, message_count: 0, event_count: 0 },
    });
    vi.mocked(fetchRunUi).mockResolvedValue({
      run_id: 'test-job-1',
      ui: { schema_version: 1, adapter: 'gradio', kind: 'output', title: 'Blueprint Run', refresh_seconds: 2, components: [], metadata: {} },
      web_ui: { adapter: 'gradio', kind: 'output', url: '', title: 'Blueprint Run', status: 'unknown', metadata: {} },
      job: {},
      run: {},
      events: [],
    });
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'test-job-1',
      workflow_id: 'test-workflow',
      name: 'Test Workflow',
      description: 'Workflow progress test',
      status: 'running',
      workflow_kind: 'batch',
      elapsed_seconds: 12,
      agent_count: { done: 0, running: 1, idle: 0, ready: 1, failed: 0, total: 1 },
      current_step_id: 'step-1',
      current_step: {
        id: 'step-1',
        label: 'Step One',
        goal: 'Run the first worker',
        status: 'running',
        current: true,
        done_count: 0,
        running_count: 1,
        idle_count: 0,
        ready_count: 1,
        failed_count: 0,
        total_count: 1,
        live: false,
        elapsed_seconds: 12,
        agents: [
          {
            id: 'agent-1',
            role: 'executor',
            working_on: 'Run the first worker',
            model: 'runtime',
            status: 'running',
            progress: 0.5,
            live: false,
            elapsed_seconds: 12,
          },
        ],
      },
      steps: [],
      messages: ['Running: streaming live job events...'],
      recent_events: [],
    });
    vi.mocked(streamWorkflowProgress).mockResolvedValue(undefined);
    vi.mocked(revealArtifact).mockResolvedValue({ ok: true });
    // mock window.location to ensure useParams picks it up
    window.history.pushState({}, 'Test page', '/jobs/test-job-1');
  });

  it('renders loading state initially', () => {
    vi.mocked(fetchJobDetails).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchJobEvents).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchJobAgentGraph).mockReturnValue(new Promise(() => {}));
    
    renderWithRouter(<JobDetails />);
    
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('renders job details and switches tabs', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 1
      },
      agents: [
        {
          agent_id: 'agent-1',
          agent_type: 'executor',
          type: 'worker',
          status: 'running',
          processed_messages: 5,
          mailbox_depth: 0,
          assigned_node: 'node-1'
        }
      ],
      sandboxes: [],
      recent_events: [],
      web_ui: {
        url: 'http://localhost:61000',
        title: 'Blueprint Dashboard',
        status: 'running',
      },
    };

    const mockEvents = [
      { timestamp: '2026-04-16T12:00:01Z', type: 'agent_started', payload: {} }
    ];

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue(mockEvents);
    vi.mocked(fetchJobAgentGraph).mockResolvedValue({
      job_id: 'test-job-1',
      status: 'running',
      nodes: [{ id: 'agent-1', agent_type: 'executor', type: 'worker', assigned_node: 'node-1', status: 'running', processed_messages: 5, mailbox_depth: 0 }],
      edges: [],
      stats: { agent_count: 1, edge_count: 0, message_count: 0, event_count: 1 },
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Blueprint Dashboard' })).toHaveAttribute('href', 'http://localhost:61000/');
    expect(screen.getByRole('link', { name: 'Web UI' })).toHaveAttribute('href', 'http://localhost:61000/');
    expect(screen.queryByText(/Executors:/i)).not.toBeInTheDocument();

    // Default tab is Progress
    expect(screen.queryByRole('button', { name: 'Graph View' })).not.toBeInTheDocument();
    expect(screen.queryByText('test-workflow')).not.toBeInTheDocument();
    expect(screen.getByText('Live Agents')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText(/Step One/)).toBeInTheDocument();

    // Switch to Agents tab; list view is the default, graph view is available there.
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('executor / worker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show agents as graph' }));
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show agents as code' }));
    expect(screen.getByText(/"job_id": "test-job-1"/)).toBeInTheDocument();
    expect(screen.getByText(/"id": "agent-1"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show agents as graph' }));
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();

    // Switch to Logs tab
    fireEvent.click(screen.getByText('Communication Logs'));
    expect(screen.getByText('[agent_started]')).toBeInTheDocument();
  });

  it('renders observability summary with trace and artifact links', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'test-job-1',
        run_id: 'trace-run',
        trace_id: 'trc_test',
        graph_id: 'graph-1',
        status: 'failed',
      },
      summary: { status: 'failed' },
      observability_summary: {
        schema_version: 'mn.observability_summary.v1',
        trace_id: 'trc_test',
        status: 'failed',
        duration_ms: 125000,
        counts: { events: 4, logs: 2, errors: 1, warnings: 1, timeline: 5 },
        retry_count: 2,
        resource_peaks: { max_memory_rss_mb: 256 },
        token_totals: { total_tokens: 1200 },
      },
      artifacts: [
        { artifact_id: 'timeline_jsonl', url: '/api/v1/runs/trace-run/artifacts/timeline.jsonl' },
        { artifact_id: 'events_jsonl', url: '/api/v1/runs/trace-run/artifacts/events.jsonl' },
        { artifact_id: 'logs_jsonl', url: '/api/v1/runs/trace-run/artifacts/logs.jsonl' },
        { artifact_id: 'errors_jsonl', url: '/api/v1/runs/trace-run/artifacts/errors.jsonl' },
      ],
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('Observability Summary')).toBeInTheDocument();
    });
    expect(screen.getByText('trc_test')).toBeInTheDocument();
    expect(screen.getByText('4 / 2 / 1')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('256 MB / 1,200')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'timeline.jsonl' })[0].getAttribute('href')).toContain('/api/v1/runs/trace-run/artifacts/timeline.jsonl');
    expect(screen.getAllByRole('link', { name: 'errors.jsonl' })[0].getAttribute('href')).toContain('/api/v1/runs/trace-run/artifacts/errors.jsonl');
  });

  it('renders artifact filenames and opens local file locations from failure and outputs', async () => {
    const artifacts = [
      {
        artifact_id: 'errors_jsonl',
        relative_path: 'errors.jsonl',
        url: '/api/v1/runs/artifact-run/artifacts/errors.jsonl',
        reveal_url: '/api/v1/runs/artifact-run/artifacts/errors.jsonl/reveal',
      },
      {
        artifact_id: 'events_jsonl',
        relative_path: 'events.jsonl',
        url: '/api/v1/runs/artifact-run/artifacts/events.jsonl',
        reveal_url: '/api/v1/runs/artifact-run/artifacts/events.jsonl/reveal',
      },
      {
        artifact_id: 'logs_jsonl',
        relative_path: 'logs.jsonl',
        url: '/api/v1/runs/artifact-run/artifacts/logs.jsonl',
        reveal_url: '/api/v1/runs/artifact-run/artifacts/logs.jsonl/reveal',
      },
      {
        artifact_id: 'job_json',
        relative_path: 'job.json',
        url: '/api/v1/runs/artifact-run/artifacts/job.json',
        reveal_url: '/api/v1/runs/artifact-run/artifacts/job.json/reveal',
      },
    ];
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'failed',
        artifacts,
      },
      failure: {
        schema_version: 'mn.error.v1',
        code: 'runtime.failure',
        desc: 'Runtime failure',
        severity: 'ERROR',
        details: {},
        links: [
          { artifact_id: 'errors_jsonl' },
          { artifact_id: 'events_jsonl' },
          { artifact_id: 'logs_jsonl' },
        ],
      },
      artifacts,
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'test-job-1',
      workflow_id: 'test-workflow',
      name: 'Test Workflow',
      description: '',
      status: 'failed',
      workflow_kind: 'batch',
      elapsed_seconds: 12,
      agent_count: { done: 0, running: 0, idle: 0, ready: 0, failed: 1, total: 1 },
      current_step_id: 'step-1',
      current_step: null,
      steps: [],
      messages: [],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: 'errors.jsonl' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'events.jsonl' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'logs.jsonl' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'job.json' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'errors.jsonl' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'job.json' }));

    await waitFor(() => {
      expect(revealArtifact).toHaveBeenCalledWith('/api/v1/runs/artifact-run/artifacts/errors.jsonl/reveal');
      expect(revealArtifact).toHaveBeenCalledWith('/api/v1/runs/artifact-run/artifacts/job.json/reveal');
    });
  });

  it('shows a workflow job failure only once in the details page', async () => {
    const failure = {
      schema_version: 'mn.error.v1',
      code: 'runtime.failure',
      desc: 'Fewer than 2 healthy connected runtime nodes observed',
      severity: 'ERROR',
      links: [],
      details: {
        category: 'runtime',
        retryable: false,
        message: 'fewer than 2 healthy connected runtime nodes observed',
      },
    };

    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'failed',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'test-job-1',
      workflow_id: 'test-workflow',
      name: 'Test Workflow',
      description: '',
      status: 'failed',
      workflow_kind: 'batch',
      elapsed_seconds: 12,
      agent_count: { done: 1, running: 0, idle: 0, ready: 1, failed: 0, total: 1 },
      current_step_id: 'step-1',
      current_step: {
        id: 'step-1',
        label: 'Report Sink',
        goal: 'result_sink',
        status: 'done',
        current: true,
        done_count: 1,
        running_count: 0,
        idle_count: 0,
        ready_count: 1,
        failed_count: 0,
        total_count: 1,
        live: false,
        elapsed_seconds: 12,
        agents: [],
      },
      steps: [],
      messages: ['Completed successfully.'],
      recent_events: [],
      failure,
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Job Failure/i)).toHaveLength(1);
    expect(screen.getByText('Fewer than 2 healthy connected runtime nodes observed')).toBeInTheDocument();
  });

  it('uses workflow progress status and hides unknown header metadata', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'vwav-be7cc6d4',
        graph_id: 'unknown',
        status: 'unknown',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'vwav-be7cc6d4',
      workflow_id: 'unknown',
      name: 'Video Watch Assistant',
      description: '',
      status: 'running',
      workflow_kind: 'service',
      elapsed_seconds: 10,
      agent_count: { done: 0, running: 1, idle: 0, ready: 1, failed: 0, total: 1 },
      current_step_id: null,
      current_step: null,
      steps: [],
      messages: [],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('vwav-be7cc6d4')).toBeInTheDocument();
    });

    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.queryByText(/Graph:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Submitted:/i)).not.toBeInTheDocument();
  });

  it('shows paused controls when compact details are paused but workflow progress is stale', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'pitev-5d7781d6',
        graph_id: null,
        status: 'paused',
        submitted_at: '2026-06-02T15:41:54Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'pitev-5d7781d6',
      workflow_id: 'personal_income_tax_expert_v1',
      name: 'Personal Income Tax Expert',
      description: '',
      status: 'running',
      workflow_kind: 'batch',
      elapsed_seconds: 2400,
      agent_count: { done: 1, running: 3, idle: 0, ready: 4, failed: 0, total: 8 },
      current_step_id: null,
      current_step: null,
      steps: [],
      messages: [],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('pitev-5d7781d6')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.getAllByText('paused').length).toBeGreaterThan(0);
  });

  it('prefers live workflow status over stale compact job status', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'service-job-1',
        graph_id: 'video_watch_assistant_v1',
        status: 'completed',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'service-job-1',
      workflow_id: 'video_watch_assistant_v1',
      name: 'Video Watch Assistant',
      description: '',
      status: 'running',
      workflow_kind: 'service',
      elapsed_seconds: 10,
      agent_count: { done: 0, running: 0, idle: 1, ready: 1, failed: 0, total: 1 },
      current_step_id: null,
      current_step: null,
      steps: [],
      messages: [],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('service-job-1')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('renders job details when agent graph is unavailable', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [
        {
          agent_id: 'agent-1',
          agent_type: 'executor',
          type: 'worker',
          status: 'running',
          processed_messages: 5,
          mailbox_depth: 0,
          assigned_node: 'node-1'
        }
      ],
      sandboxes: [],
      recent_events: [],
    };

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchJobAgentGraph).mockRejectedValue(new Error('Not Found'));

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    expect(screen.getByText('agent-1')).toBeInTheDocument();
  });

  it('populates the agents list from graph nodes when job details have no agents', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchJobAgentGraph).mockResolvedValue({
      job_id: 'test-job-1',
      graph_id: 'graph-1',
      status: 'running',
      nodes: [
        {
          id: 'planner',
          alias: 'video_monitor',
          display_name: 'Video Monitor',
          label: 'Raw Planner',
          agent_type: 'executor',
          type: 'worker',
          assigned_node: 'node-a',
          status: 'declared',
          processed_messages: 0,
          mailbox_depth: 0,
        },
      ],
      edges: [],
      stats: { agent_count: 1, edge_count: 0, message_count: 0, event_count: 0 },
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    expect(screen.getByText('video_monitor')).toBeInTheDocument();
    expect(screen.queryByText('Raw Planner')).not.toBeInTheDocument();
    expect(screen.getByText('executor / worker')).toBeInTheDocument();
    expect(screen.getByText('node-a')).toBeInTheDocument();
  });

  it('uses workflow progress aliases when the graph only has runtime infrastructure nodes', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'video-job-1',
        graph_id: 'video_watch_assistant_v1',
        status: 'running',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchJobAgentGraph).mockResolvedValue({
      job_id: 'video-job-1',
      graph_id: 'runtime-wrapper',
      status: 'running',
      nodes: [
        { id: 'runtime', label: 'System Runtime', agent_type: 'system', type: 'runtime', assigned_node: 'system/runtime', status: 'observed', processed_messages: 0, mailbox_depth: 0 },
        { id: 'workflow_manifest_executor', label: 'Workflow Manifest Executor', agent_type: 'executor', type: 'worker', assigned_node: 'node-a', status: 'paused', processed_messages: 0, mailbox_depth: 1 },
        { id: 'web_ui_dashboard', label: 'Web Ui Dashboard', agent_type: 'executor', type: 'worker', assigned_node: 'node-a', status: 'paused', processed_messages: 0, mailbox_depth: 1 },
      ],
      edges: [],
      stats: { agent_count: 3, edge_count: 0, message_count: 0, event_count: 0 },
    });
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'video-job-1',
      workflow_id: 'video_watch_assistant',
      name: 'Video Watch Assistant',
      description: '',
      status: 'running',
      workflow_kind: 'service',
      elapsed_seconds: 12,
      agent_count: { done: 0, running: 1, idle: 0, ready: 1, failed: 0, total: 1 },
      current_step_id: 'start_video_monitor',
      current_step: null,
      steps: [
        {
          id: 'start_video_monitor',
          label: 'Start Video Monitor',
          goal: 'Validate the mapped stream source and start the monitoring session.',
          status: 'running',
          current: true,
          done_count: 0,
          running_count: 1,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: true,
          elapsed_seconds: 12,
          agents: [
            {
              id: 'video_monitor',
              alias: 'video_monitor',
              display_name: 'Video Monitor',
              role: 'Coordinate video monitoring',
              working_on: 'Coordinate video monitoring',
              model: 'runtime',
              assigned_node: 'node-a',
              status: 'running',
              progress: 0.5,
              live: true,
              elapsed_seconds: 12,
            },
          ],
        },
      ],
      messages: [],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('video-job-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));

    expect(screen.getByText('video_monitor')).toBeInTheDocument();
    expect(screen.queryByText('Workflow Manifest Executor')).not.toBeInTheDocument();
    expect(screen.queryByText('Web Ui Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('node-a')).toBeInTheDocument();
  });

  it('shows runtime fallback progress when workflow progress is unavailable', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [
        {
          agent_id: 'agent-1',
          agent_type: 'executor',
          type: 'worker',
          status: 'observed',
          processed_messages: 5,
          mailbox_depth: 0,
          assigned_node: 'node-1'
        }
      ],
      sandboxes: [],
      recent_events: [
        { timestamp: '2026-04-16T12:00:01Z', type: 'executor_lease_acquired', agent_id: 'agent-1', payload: { type: 'video_frame_tick' } }
      ],
    };

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockRejectedValue(new Error('Not Found'));

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
    expect(screen.queryByText(/Loading workflow progress/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Runtime Agents/).length).toBeGreaterThan(0);
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getAllByText(/Showing runtime job status/i).length).toBeGreaterThan(0);
  });

  it('renders service workflow agents as idle instead of done while the job is running', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'test-job-1',
        graph_id: 'video_watch_assistant_v1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'test-job-1',
      workflow_id: 'video_watch_assistant_v1',
      name: 'Video Watch Assistant',
      description: '',
      status: 'running',
      workflow_kind: 'service',
      elapsed_seconds: 342,
      agent_count: { done: 1, running: 0, idle: 1, ready: 2, failed: 0, total: 2 },
      current_step_id: 'visual_detector',
      current_step: {
        id: 'visual_detector',
        label: 'Visual Detector',
        goal: 'Analyze sampled frames',
        status: 'idle',
        current: true,
        done_count: 0,
        running_count: 0,
        idle_count: 1,
        ready_count: 1,
        failed_count: 0,
        total_count: 1,
        live: true,
        elapsed_seconds: 0,
        agents: [
          {
            id: 'visual_detector',
            role: 'executor',
            working_on: 'Review visual detection',
            model: 'runtime',
            status: 'idle',
            progress: 0.2,
            live: true,
            elapsed_seconds: 0,
          },
        ],
      },
      steps: [
        {
          id: 'ingress',
          label: 'Ingress',
          goal: 'router',
          status: 'done',
          current: false,
          done_count: 1,
          running_count: 0,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 1,
          agents: [],
        },
        {
          id: 'visual_detector',
          label: 'Visual Detector',
          goal: 'executor',
          status: 'idle',
          current: true,
          done_count: 0,
          running_count: 0,
          idle_count: 1,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: true,
          elapsed_seconds: 0,
          agents: [],
        },
      ],
      messages: ['Observing: latest event video_watch_frame_observed'],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));

    expect(screen.getByText(/0\/2/)).toBeInTheDocument();
    expect(screen.getAllByText('idle').length).toBeGreaterThan(0);
    expect(screen.getByText('Review visual detection')).toBeInTheDocument();
  });

  it('renders graph workflow layers and multiple active steps in the Progress tab', async () => {
    vi.mocked(fetchJobDetails).mockResolvedValue({
      job: {
        job_id: 'test-job-1',
        graph_id: 'tax_graph',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    });
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockResolvedValue({
      schema_version: 1,
      job_id: 'test-job-1',
      workflow_id: 'tax_graph',
      name: 'Tax Graph',
      description: '',
      status: 'running',
      workflow_kind: 'batch',
      elapsed_seconds: 20,
      agent_count: { done: 1, running: 2, idle: 0, ready: 3, failed: 0, total: 4 },
      current_step_id: 'income',
      current_step_ids: ['income', 'property'],
      edges: [
        { from: 'intake', to: 'income', event: 'intake_ready' },
        { from: 'intake', to: 'property', event: 'intake_ready' },
      ],
      layers: [['intake'], ['income', 'property']],
      current_step: null,
      steps: [
        {
          id: 'intake',
          label: 'Intake',
          goal: '',
          status: 'done',
          current: false,
          parents: [],
          children: ['income', 'property'],
          layer: 0,
          done_count: 1,
          running_count: 0,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 1,
          agents: [],
        },
        {
          id: 'income',
          label: 'Income',
          goal: '',
          status: 'running',
          current: true,
          parents: ['intake'],
          children: [],
          layer: 1,
          done_count: 0,
          running_count: 1,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 4,
          agents: [{ id: 'income_agent', role: 'Income', working_on: 'Prepare income', model: 'runtime', status: 'running', progress: 0.4, live: false, elapsed_seconds: 4 }],
        },
        {
          id: 'property',
          label: 'Property',
          goal: '',
          status: 'running',
          current: true,
          parents: ['intake'],
          children: [],
          layer: 1,
          done_count: 0,
          running_count: 1,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 4,
          agents: [{ id: 'property_agent', role: 'Property', working_on: 'Prepare property', model: 'runtime', status: 'running', progress: 0.3, live: false, elapsed_seconds: 4 }],
        },
      ],
      messages: ['Running: graph branches active'],
      recent_events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));

    expect(screen.getByText(/2 active steps/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Income/)).toBeInTheDocument();
    expect(screen.getByText(/3\. Property/)).toBeInTheDocument();
    expect(screen.getByText('income_agent')).toBeInTheDocument();
    expect(screen.getByText('property_agent')).toBeInTheDocument();
  });

  it('shows blueprint web ui from the run ui endpoint when job details are compact', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        run_id: 'blueprint-run-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    };

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchRunUi).mockResolvedValue({
      run_id: 'blueprint-run-1',
      ui: { schema_version: 1, adapter: 'gradio', kind: 'output', title: 'Blueprint Run', refresh_seconds: 2, components: [], metadata: {} },
      web_ui: {
        adapter: 'gradio',
        kind: 'output',
        url: 'http://localhost:61000',
        title: 'Blueprint Dashboard',
        status: 'running',
        metadata: {},
      },
      job: {},
      run: {},
      events: [],
    });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Blueprint Dashboard' })).toHaveAttribute('href', 'http://localhost:61000/');
    });
    expect(fetchRunUi).toHaveBeenCalledWith('blueprint-run-1');
  });

  it('pauses a running job', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    };

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(pauseJob).mockResolvedValue({ status: 'paused', job_id: 'test-job-1' });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    const pauseButton = screen.getByText('Pause');
    fireEvent.click(pauseButton);
    expect(await screen.findByText('Pause this job?')).toBeInTheDocument();
    expect(pauseJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pause job' }));

    await waitFor(() => expect(pauseJob).toHaveBeenCalledWith('test-job-1'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });
    expect(screen.getAllByText('paused').length).toBeGreaterThan(0);
  });

  it('resumes a paused job', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'paused',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    };

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(fetchWorkflowProgress).mockRejectedValue(new Error('Not Found'));
    vi.mocked(resumeJob).mockResolvedValue({ status: 'resumed', job_id: 'test-job-1' });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    const resumeButton = screen.getByText('Resume');
    fireEvent.click(resumeButton);
    expect(await screen.findByText('Resume this job?')).toBeInTheDocument();
    expect(resumeJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resume job' }));

    await waitFor(() => expect(resumeJob).toHaveBeenCalledWith('test-job-1'));
    await waitFor(() => {
      expect(fetchJobDetails).toHaveBeenCalled(); // Ensure it was called
    });
  });

  it('cancels a job', async () => {
    const mockDetails = {
      job: {
        job_id: 'test-job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    };

    vi.mocked(fetchJobDetails).mockResolvedValue(mockDetails);
    vi.mocked(fetchJobEvents).mockResolvedValue([]);
    vi.mocked(cancelJob).mockResolvedValue({ status: 'cancelled', job_id: 'test-job-1' });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(await screen.findByText('Cancel this job?')).toBeInTheDocument();
    expect(cancelJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }));

    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('test-job-1'));
  });
});
