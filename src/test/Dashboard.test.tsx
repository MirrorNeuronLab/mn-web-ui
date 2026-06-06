import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import Dashboard from '../pages/Dashboard';
import { addClusterNode, fetchJobs, fetchSystemSummary, removeClusterNode } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', () => ({
  fetchSystemSummary: vi.fn(),
  fetchJobs: vi.fn(),
  addClusterNode: vi.fn(),
  removeClusterNode: vi.fn(),
}));

const renderDashboard = () => render(
  <TooltipProvider>
    <Dashboard />
    <Toaster />
  </TooltipProvider>
);

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
  });

  it('renders skeleton loading state initially', () => {
    // Return a promise that doesn't resolve immediately to keep it in loading state
    vi.mocked(fetchSystemSummary).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchJobs).mockReturnValue(new Promise(() => {}));
    
    const { container } = renderDashboard();
    
    // Check if the skeleton pulse animation is present
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders data correctly when loaded', async () => {
    const mockData = {
      nodes: [
        {
          name: 'mn1@127.0.0.1',
          connected_nodes: ['mn1@127.0.0.1'],
          self: true,
          hardware: {
            platform: { os: 'linux', family: 'unix' },
            cpu: { logical_processors: 10, load_ratio: 0.12 },
            memory: { total_bytes: 17179869184, available_bytes: 8589934592 },
            devices: [
              { kind: 'gpu', type: 'nvidia/gpu', vendor: 'nvidia', driver: 'cuda', memory_total_mb: 12288 }
            ]
          },
          executor_pools: {
            default: { capacity: 2, available: 1, in_use: 1, queued: 0, active: 1 }
          }
        }
      ],
      jobs: [
        { job_id: 'job1', status: 'running' },
        { job_id: 'job2', status: 'pending' }
      ]
    };

    vi.mocked(fetchSystemSummary).mockResolvedValue(mockData);
    vi.mocked(fetchJobs).mockResolvedValue([
      { job_id: 'job1', graph_id: 'graph-1', status: 'running', active_executors: 1, executor_count: 2 },
      { job_id: 'job2', graph_id: 'graph-2', status: 'pending', active_executors: 0, executor_count: 1 },
    ]);

    renderDashboard();

    // Wait for the data to load and skeleton to disappear
    await waitFor(() => {
      expect(screen.queryByText('Total Jobs')).toBeInTheDocument();
    });

    expect(screen.getByText('Active Jobs')).toBeInTheDocument();
    expect(screen.getAllByText('CPU').length).toBeGreaterThan(1);
    expect(screen.getAllByText('10 cores').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Memory').length).toBeGreaterThan(1);
    expect(screen.getAllByText('12 / 16 GB').length).toBeGreaterThan(1);
    expect(screen.getAllByText('GPU').length).toBeGreaterThan(1);
    expect(screen.getAllByText('1 GPU').length).toBeGreaterThan(1);
    expect(screen.getByText('Linux')).toBeInTheDocument();
    expect(screen.getAllByText('NVIDIA').length).toBeGreaterThan(0);
    
    // Check if node details are rendered
    expect(screen.getByText('mn1@127.0.0.1')).toBeInTheDocument();
    expect(screen.queryByText('Pool: default')).not.toBeInTheDocument();
    expect(screen.queryByText('Capacity')).not.toBeInTheDocument();
    expect(screen.queryByText('Executor Slots')).not.toBeInTheDocument();
  });

  it('renders macOS and Apple Metal badges from runtime hardware data', async () => {
    vi.mocked(fetchSystemSummary).mockResolvedValue({
      nodes: [
        {
          name: 'mirror_neuron@mac.local',
          connected_nodes: ['mirror_neuron@mac.local'],
          self: true,
          hardware: {
            platform: { os: 'darwin', family: 'unix' },
            cpu: { logical_processors: 12, load_ratio: 0.05 },
            memory: { total_bytes: 34359738368, available_bytes: 21474836480 },
            devices: [
              {
                kind: 'gpu',
                type: 'apple/gpu',
                vendor: 'apple',
                driver: 'metal',
                memory_total_mb: 32768,
                capabilities: ['gpu', 'apple', 'metal', 'unified_memory'],
              },
            ],
          },
          executor_pools: {},
        },
      ],
      jobs: [],
    });
    vi.mocked(fetchJobs).mockResolvedValue([]);

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Runtime Resources')).toBeInTheDocument());

    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getAllByText('Apple Metal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('32 / 32 GB').length).toBeGreaterThan(1);
  });

  it('uses an empty jobs response instead of stale summary jobs for metrics', async () => {
    vi.mocked(fetchSystemSummary).mockResolvedValue({
      nodes: [
        {
          name: 'mirror_neuron@192.168.4.34',
          connected_nodes: ['mirror_neuron@192.168.4.34'],
          self: false,
          executor_pools: {
            default: { capacity: 50, available: 50, in_use: 0, queued: 0, active: 0 }
          }
        }
      ],
      jobs: [
        { job_id: 'stale-job', status: 'completed' }
      ]
    });
    vi.mocked(fetchJobs).mockResolvedValue([]);

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Total Jobs')).toBeInTheDocument());

    const totalJobsCard = screen.getByText('Total Jobs').parentElement?.parentElement;
    expect(totalJobsCard).not.toBeNull();
    expect(within(totalJobsCard as HTMLElement).getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0 terminal or idle jobs')).toBeInTheDocument();
    expect(screen.getByText('1 cluster node connected')).toBeInTheDocument();
  });

  it('adds a remote node with host and token', async () => {
    const localNode = {
      name: 'mn1@127.0.0.1',
      connected_nodes: ['mn1@127.0.0.1'],
      self: true,
      executor_pools: {},
    };
    const remoteNode = {
      name: 'mirror_neuron@10.0.0.42',
      connected_nodes: ['mn1@127.0.0.1'],
      self: false,
      executor_pools: {},
    };

    vi.mocked(fetchSystemSummary)
      .mockResolvedValueOnce({ nodes: [localNode], jobs: [] })
      .mockResolvedValue({ nodes: [localNode, remoteNode], jobs: [] });
    vi.mocked(fetchJobs).mockResolvedValue([]);
    vi.mocked(addClusterNode).mockResolvedValue({
      ok: true,
      host: '10.0.0.42',
      node_name: 'mirror_neuron@10.0.0.42',
      status: 'connected',
      message: 'mirror_neuron@10.0.0.42 was added to this box.',
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Runtime Resources')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    const dialog = screen.getByRole('dialog', { name: /add node to this box/i });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /remote host or ip/i }), {
      target: { value: '10.0.0.42' },
    });
    fireEvent.change(within(dialog).getByLabelText(/token from mn node expose/i), {
      target: { value: 'join-token-1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^add node$/i }));
    expect(await screen.findByText('Add this peer node?')).toBeInTheDocument();
    expect(addClusterNode).not.toHaveBeenCalled();

    const addNodeButtons = screen.getAllByRole('button', { name: /^add node$/i });
    fireEvent.click(addNodeButtons[addNodeButtons.length - 1]);

    await waitFor(() => expect(addClusterNode).toHaveBeenCalledWith({ host: '10.0.0.42', token: 'join-token-1' }));
    await waitFor(() => expect(screen.getByText('mirror_neuron@10.0.0.42')).toBeInTheDocument());
  });

  it('reveals the token without changing the separate host and token inputs', async () => {
    vi.mocked(fetchSystemSummary).mockResolvedValue({ nodes: [], jobs: [] });
    vi.mocked(fetchJobs).mockResolvedValue([]);

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Runtime Resources')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));

    const dialog = screen.getByRole('dialog', { name: /add node to this box/i });
    const hostInput = within(dialog).getByRole('textbox', { name: /remote host or ip/i });
    fireEvent.change(hostInput, {
      target: { value: '192.168.4.173' },
    });

    const tokenInput = within(dialog).getByLabelText(/token from mn node expose/i);
    fireEvent.change(tokenInput, {
      target: { value: 'mn-test-token' },
    });

    expect(hostInput).toHaveValue('192.168.4.173');
    expect(tokenInput).toHaveValue('mn-test-token');
    expect(tokenInput).toHaveAttribute('type', 'password');

    fireEvent.click(within(dialog).getByRole('button', { name: /show token/i }));
    expect(tokenInput).toHaveAttribute('type', 'text');
    expect(within(dialog).getByRole('button', { name: /hide token/i })).toBeInTheDocument();
  });

  it('removes a peer node from the cluster list', async () => {
    const localNode = {
      name: 'mn1@127.0.0.1',
      connected_nodes: ['mn1@127.0.0.1'],
      self: true,
      executor_pools: {},
    };
    const remoteNode = {
      name: 'mirror_neuron@10.0.0.42',
      connected_nodes: ['mn1@127.0.0.1'],
      self: false,
      executor_pools: {},
    };

    vi.mocked(fetchSystemSummary)
      .mockResolvedValueOnce({ nodes: [localNode, remoteNode], jobs: [] })
      .mockResolvedValue({ nodes: [localNode], jobs: [] });
    vi.mocked(fetchJobs).mockResolvedValue([]);
    vi.mocked(removeClusterNode).mockResolvedValue({
      ok: true,
      node_name: 'mirror_neuron@10.0.0.42',
      status: 'disconnected',
      message: 'mirror_neuron@10.0.0.42 was removed from this box.',
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('mirror_neuron@10.0.0.42')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(await screen.findByText('Remove this peer node?')).toBeInTheDocument();
    expect(removeClusterNode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /remove node/i }));

    await waitFor(() => expect(removeClusterNode).toHaveBeenCalledWith('mirror_neuron@10.0.0.42'));
    await waitFor(() => expect(screen.queryByText('mirror_neuron@10.0.0.42')).not.toBeInTheDocument());
  });
});
