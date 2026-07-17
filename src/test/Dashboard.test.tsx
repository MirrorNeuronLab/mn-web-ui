import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import Dashboard from '../pages/Dashboard';
import { fetchSystemSummary } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', () => ({
  fetchSystemSummary: vi.fn(),
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
            cpu: { logical_processors: 10, load_ratio: 0.12, model: 'AMD Ryzen AI Max+ 395' },
            memory: { total_bytes: 17179869184, available_bytes: 8589934592 },
            devices: [
              {
                kind: 'gpu',
                type: 'nvidia/gpu',
                vendor: 'nvidia',
                driver: 'cuda',
                api: 'cuda',
                api_version: '12.4',
                gpu_type: 'nvidia-cuda-12.4',
                model: 'NVIDIA RTX 4090',
                name: 'NVIDIA RTX 4090',
                memory_total_mb: 12288,
              }
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
    expect(screen.getByText('NVIDIA')).toBeInTheDocument();
    expect(screen.getByTitle('CPU: AMD Ryzen AI Max+ 395 | GPU: NVIDIA RTX 4090')).toBeInTheDocument();
    expect(screen.getByTitle('NVIDIA CUDA 12.4')).toBeInTheDocument();
    
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
            cpu: { logical_processors: 12, load_ratio: 0.05, model: 'Apple M4 Max' },
            memory: { total_bytes: 34359738368, available_bytes: 21474836480 },
            devices: [
              {
                kind: 'gpu',
                type: 'apple/gpu',
                vendor: 'apple',
                driver: 'metal',
                api: 'metal',
                gpu_type: 'mac-metal',
                model: 'Apple M4 Max',
                name: 'Apple M4 Max',
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
    renderDashboard();

    await waitFor(() => expect(screen.getByText('mirror_neuron@mac.local')).toBeInTheDocument());

    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getByText('Apple Metal')).toBeInTheDocument();
    expect(screen.getByTitle('CPU: Apple M4 Max | GPU: Apple M4 Max')).toBeInTheDocument();
    expect(screen.getByTitle('Apple Metal')).toBeInTheDocument();
    expect(screen.getAllByText('32 / 32 GB').length).toBeGreaterThan(1);
  });

  it('uses SDK system-summary jobs for metrics', async () => {
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
        { job_id: 'summary-job', status: 'completed' }
      ]
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('Total Jobs')).toBeInTheDocument());

    const totalJobsCard = screen.getByText('Total Jobs').parentElement?.parentElement;
    expect(totalJobsCard).not.toBeNull();
    expect(within(totalJobsCard as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('1 terminal or idle jobs')).toBeInTheDocument();
    expect(screen.getByText('1 cluster node connected')).toBeInTheDocument();
  });

  it('omits cluster add and remove controls from runtime resources', async () => {
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

    vi.mocked(fetchSystemSummary).mockResolvedValue({ nodes: [localNode, remoteNode], jobs: [] });

    renderDashboard();

    await waitFor(() => expect(screen.getByText('mn1@127.0.0.1')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('mirror_neuron@10.0.0.42')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /add node/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
