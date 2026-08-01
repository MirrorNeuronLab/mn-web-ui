import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import Runs from '../pages/Jobs';
import { cancelAllJobs, cancelRun, clearJobs, fetchJobs, pauseRun } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';
import { ConfirmActionDialogHost } from '../components/ui/confirm-action-dialog';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchJobs: vi.fn(),
    pauseRun: vi.fn(),
    cancelAllJobs: vi.fn(),
    cancelRun: vi.fn(),
    clearJobs: vi.fn(),
  };
});

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <TooltipProvider>
      <BrowserRouter>{ui}</BrowserRouter>
      <ConfirmActionDialogHost />
      <Toaster />
    </TooltipProvider>
  );
};

describe('Runs Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
  });

  it('renders skeleton loading state initially', () => {
    vi.mocked(fetchJobs).mockReturnValue(new Promise(() => {}));
    
    const { container } = renderWithRouter(<Runs />);
    
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an empty execution history', async () => {
    vi.mocked(fetchJobs).mockResolvedValue([]);

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('No execution runs found.')).toBeInTheDocument();
    });
  });

  it('renders jobs list correctly', async () => {
    const mockJobs = [
      {
        job_id: 'test-job-123',
        graph_id: 'simple-graph',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 0,
        executor_count: 2
      }
    ];

    vi.mocked(fetchJobs).mockResolvedValue(mockJobs);

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('test-job-123')).toBeInTheDocument();
    });

    expect(screen.getByText('simple-graph')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText('View run test-job-123')).toHaveAttribute('href', '/runs/test-job-123');
    expect(fetchJobs).toHaveBeenCalledWith({ includeTerminal: true });
  });

  it('reloads with active jobs when the active-only switch is enabled', async () => {
    vi.mocked(fetchJobs)
      .mockResolvedValueOnce([
        {
          job_id: 'done-job-1',
          graph_id: 'tax-graph',
          status: 'completed',
          submitted_at: '2026-04-16T12:00:00Z',
          active_executors: 0,
          executor_count: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          job_id: 'running-job-1',
          graph_id: 'tax-graph',
          status: 'running',
          submitted_at: '2026-04-16T12:01:00Z',
          active_executors: 1,
          executor_count: 2,
        },
      ]);

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('done-job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Active only' }));

    await waitFor(() => {
      expect(screen.getByText('running-job-1')).toBeInTheDocument();
    });

    expect(screen.queryByText('done-job-1')).not.toBeInTheDocument();
    expect(fetchJobs).toHaveBeenNthCalledWith(1, { includeTerminal: true });
    expect(fetchJobs).toHaveBeenNthCalledWith(2, { includeTerminal: false });
  });

  it('enables bulk buttons after selecting rows and pauses selected jobs', async () => {
    const mockJobs = [
      {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2
      },
      {
        job_id: 'job-2',
        graph_id: 'graph-2',
        status: 'running',
        submitted_at: '2026-04-16T12:01:00Z',
        active_executors: 1,
        executor_count: 2
      }
    ];

    vi.mocked(fetchJobs).mockResolvedValue(mockJobs);
    vi.mocked(pauseRun).mockResolvedValue({ run_id: 'job-1', status: 'paused' });

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    const pauseButton = screen.getByRole('button', { name: 'Pause' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(pauseButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Select run job-1'));
    fireEvent.click(screen.getByLabelText('Select run job-2'));

    expect(screen.getByRole('button', { name: 'Pause (2)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel (2)' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Pause (2)' }));
    expect(await screen.findByText('Pause 2 selected runs?')).toBeInTheDocument();
    expect(pauseRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(pauseRun).toHaveBeenCalledWith('job-1');
      expect(pauseRun).toHaveBeenCalledWith('job-2');
    });
  });

  it('cancels all selected jobs', async () => {
    const mockJobs = [
      {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2
      },
      {
        job_id: 'job-2',
        graph_id: 'graph-2',
        status: 'pending',
        submitted_at: '2026-04-16T12:01:00Z',
        active_executors: 0,
        executor_count: 2
      }
    ];

    vi.mocked(fetchJobs).mockResolvedValue(mockJobs);
    vi.mocked(cancelRun).mockResolvedValue({ run_id: 'job-1', status: 'cancelled' });

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Select run job-1'));
    fireEvent.click(screen.getByLabelText('Select run job-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel (2)' }));
    expect(await screen.findByText('Cancel 2 selected runs?')).toBeInTheDocument();
    expect(cancelRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(cancelRun).toHaveBeenCalledWith('job-1');
      expect(cancelRun).toHaveBeenCalledWith('job-2');
    });
  });

  it('cancels every active job through the cancel-all API', async () => {
    const mockJobs = [
      {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2,
      },
    ];

    vi.mocked(fetchJobs).mockResolvedValue(mockJobs);
    vi.mocked(cancelAllJobs).mockResolvedValue({
      operation_id: 'op-cancel-1',
      kind: 'cancel_all_jobs',
      status: 'running',
      counters: { total: 1, started: 1, finished: 0, succeeded: 0, failed: 0, deferred: 0 },
    });

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel all' }));
    expect(await screen.findByText('Cancel all active runs?')).toBeInTheDocument();
    expect(cancelAllJobs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel all' }));

    await waitFor(() => {
      expect(cancelAllJobs).toHaveBeenCalledOnce();
    });
    expect(cancelRun).not.toHaveBeenCalled();
  });

  it('does not cancel all jobs when the confirmation is dismissed', async () => {
    vi.mocked(fetchJobs).mockResolvedValue([{
      job_id: 'job-1',
      graph_id: 'graph-1',
      status: 'running',
      submitted_at: '2026-04-16T12:00:00Z',
      active_executors: 1,
      executor_count: 2,
    }]);

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel all' }));
    expect(await screen.findByText('Cancel all active runs?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep runs' }));

    await waitFor(() => {
      expect(screen.queryByText('Cancel all active runs?')).not.toBeInTheDocument();
    });
    expect(cancelAllJobs).not.toHaveBeenCalled();
  });

  it('does not cancel selected jobs when the confirmation is dismissed', async () => {
    const mockJobs = [
      {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2
      }
    ];

    vi.mocked(fetchJobs).mockResolvedValue(mockJobs);
    vi.mocked(cancelRun).mockResolvedValue({ run_id: 'job-1', status: 'cancelled' });

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Select run job-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel (1)' }));
    expect(await screen.findByText('Cancel 1 selected run?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep runs' }));

    await waitFor(() => {
      expect(screen.queryByText('Cancel 1 selected job?')).not.toBeInTheDocument();
    });
    expect(cancelRun).not.toHaveBeenCalled();
  });

  it('clears non-running jobs and refreshes the list', async () => {
    const mockJobs = [
      {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'completed',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 0,
        executor_count: 0
      }
    ];

    vi.mocked(fetchJobs)
      .mockResolvedValueOnce(mockJobs)
      .mockResolvedValueOnce([]);
    vi.mocked(clearJobs).mockResolvedValue({
      operation_id: 'op-clean-1',
      kind: 'clear_jobs',
      status: 'running',
      counters: { total: 1, started: 1, finished: 0, succeeded: 0, failed: 0, deferred: 0 },
    });

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clean up' }));
    expect(await screen.findByText('Clean execution history?')).toBeInTheDocument();
    expect(
      screen.getByText(/Offline cleanup continues when a node rejoins/)
    ).toBeInTheDocument();
    expect(clearJobs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start cleanup' }));

    await waitFor(() => {
      expect(clearJobs).toHaveBeenCalledOnce();
      expect(screen.getByText('No execution runs found.')).toBeInTheDocument();
    });

    const clearedToast = await screen.findByText('Operation op-clean-1 will continue in the background.');
    const toastElement = clearedToast.closest('[data-sonner-toast]');
    expect(screen.queryByText('Clearing non-running jobs...')).not.toBeInTheDocument();
    expect(toastElement).toHaveAttribute('data-type', 'default');
    expect(toastElement).toHaveAttribute('data-dismissible', 'true');
    expect(toastElement?.querySelector('.sonner-loading-wrapper')).not.toBeInTheDocument();
  });

  it('shows backend detail and removes confirm actions when clear fails', async () => {
    const mockJobs = [
      {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'completed',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 0,
        executor_count: 0
      }
    ];

    vi.mocked(fetchJobs).mockResolvedValue(mockJobs);
    vi.mocked(clearJobs).mockRejectedValue({
      response: {
        data: {
          error: 'ClearJobs requires MN_GRPC_ADMIN_TOKEN',
        },
      },
    });

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clean up' }));
    expect(await screen.findByText('Clean execution history?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start cleanup' }));

    expect(await screen.findByText('ClearJobs requires MN_GRPC_ADMIN_TOKEN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start cleanup' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep history' })).not.toBeInTheDocument();
  });
});
