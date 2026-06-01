import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import JobDetails from '../pages/JobDetails';
import { fetchJobDetails, fetchJobEvents, fetchJobAgentGraph, fetchRunUi, fetchWorkflowProgress, streamWorkflowProgress, cancelJob, pauseJob, resumeJob } from '../api';

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
    <BrowserRouter>
      <Routes>
        <Route path="/jobs/:id" element={ui} />
      </Routes>
    </BrowserRouter>
  );
};

describe('JobDetails Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // Default tab is graph
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show code view' }));
    expect(screen.getByText(/"job_id": "test-job-1"/)).toBeInTheDocument();
    expect(screen.getByText(/"id": "agent-1"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show workflow view' }));
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();

    // Switch to Agents tab
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('executor / worker')).toBeInTheDocument();

    // Switch to Logs tab
    fireEvent.click(screen.getByText('Communication Logs'));
    expect(screen.getByText('[agent_started]')).toBeInTheDocument();
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

    expect(screen.getByText(/2\/2 agents/)).toBeInTheDocument();
    expect(screen.getAllByText('idle').length).toBeGreaterThan(0);
    expect(screen.getByText('Review visual detection')).toBeInTheDocument();
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

    expect(pauseJob).toHaveBeenCalledWith('test-job-1');
    await waitFor(() => {
      expect(fetchJobDetails).toHaveBeenCalled(); // Ensure it was called
    });
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
    vi.mocked(resumeJob).mockResolvedValue({ status: 'resumed', job_id: 'test-job-1' });

    renderWithRouter(<JobDetails />);

    await waitFor(() => {
      expect(screen.getByText('test-job-1')).toBeInTheDocument();
    });

    const resumeButton = screen.getByText('Resume');
    fireEvent.click(resumeButton);

    expect(resumeJob).toHaveBeenCalledWith('test-job-1');
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

    // Should open confirm modal
    expect(screen.getByText('Are you sure you want to cancel this job? This action cannot be undone and will stop all running agents.')).toBeInTheDocument();

    const confirmButton = screen.getAllByText('Cancel Job')[1];
    fireEvent.click(confirmButton);

    expect(cancelJob).toHaveBeenCalledWith('test-job-1');
    await waitFor(() => {
      expect(fetchJobDetails).toHaveBeenCalled(); // Ensure it was called
    });
  });
});
