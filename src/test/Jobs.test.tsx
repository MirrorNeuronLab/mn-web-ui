import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import Runs from '../pages/Jobs';
import { cancelRun, fetchRuns, pauseRun } from '../api';
import type { RunSummary } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';
import { ConfirmActionDialogHost } from '../components/ui/confirm-action-dialog';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchRuns: vi.fn(),
    pauseRun: vi.fn(),
    cancelRun: vi.fn(),
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

type RunFixture = Pick<RunSummary, 'run_id' | 'status'> & Partial<RunSummary>;

const runsPage = (items: RunFixture[]): Awaited<ReturnType<typeof fetchRuns>> => ({
  items: items.map((item) => ({ attempt: 1, ...item })),
  next_page_token: null,
});

describe('Runs Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error alert with retry when loading fails', async () => {
    vi.mocked(fetchRuns).mockRejectedValue(new Error('down'));

    renderWithRouter(<Runs />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/down/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps load-more rows when a background poll returns the first page', async () => {
    vi.useFakeTimers();
    try {
      const pageA = { items: [{ run_id: 'run-a', status: 'running', attempt: 1 }], next_page_token: 't1' };
      const pageB = { items: [{ run_id: 'run-b', status: 'running', attempt: 1 }], next_page_token: null };
      vi.mocked(fetchRuns)
        .mockResolvedValueOnce(pageA)
        .mockResolvedValueOnce(pageB)
        .mockResolvedValue({ items: pageA.items, next_page_token: 't1' });

      renderWithRouter(<Runs />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('run-a')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('run-b')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByText('run-a')).toBeInTheDocument();
      expect(screen.getByText('run-b')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders skeleton loading state initially', () => {
    vi.mocked(fetchRuns).mockReturnValue(new Promise(() => {}));
    
    const { container } = renderWithRouter(<Runs />);
    
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an empty execution history', async () => {
    vi.mocked(fetchRuns).mockResolvedValue(runsPage([]));

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('No execution runs found.')).toBeInTheDocument();
    });
  });

  it('renders jobs list correctly', async () => {
    const mockJobs = [
      {
        run_id: 'test-job-123',
        graph_id: 'simple-graph',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 0,
        executor_count: 2
      }
    ];

    vi.mocked(fetchRuns).mockResolvedValue(runsPage(mockJobs));

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('test-job-123')).toBeInTheDocument();
    });

    expect(screen.getByText('simple-graph')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText('View run test-job-123')).toHaveAttribute('href', '/runs/test-job-123');
    expect(fetchRuns).toHaveBeenCalledWith({ includeTerminal: true });
  });

  it('reloads with active jobs when the active-only switch is enabled', async () => {
    vi.mocked(fetchRuns)
      .mockResolvedValueOnce(runsPage([
        {
          run_id: 'done-job-1',
          graph_id: 'tax-graph',
          status: 'completed',
          submitted_at: '2026-04-16T12:00:00Z',
          active_executors: 0,
          executor_count: 0,
        },
      ]))
      .mockResolvedValueOnce(runsPage([
        {
          run_id: 'running-job-1',
          graph_id: 'tax-graph',
          status: 'running',
          submitted_at: '2026-04-16T12:01:00Z',
          active_executors: 1,
          executor_count: 2,
        },
      ]));

    renderWithRouter(<Runs />);

    await waitFor(() => {
      expect(screen.getByText('done-job-1')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Select run done-job-1')).toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Active only' }));

    await waitFor(() => {
      expect(screen.getByText('running-job-1')).toBeInTheDocument();
    });

    expect(screen.queryByText('done-job-1')).not.toBeInTheDocument();
    expect(fetchRuns).toHaveBeenNthCalledWith(1, { includeTerminal: true });
    expect(fetchRuns).toHaveBeenNthCalledWith(2, { includeTerminal: false });
  });

  it('enables bulk buttons after selecting rows and pauses selected jobs', async () => {
    const mockJobs = [
      {
        run_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2
      },
      {
        run_id: 'job-2',
        graph_id: 'graph-2',
        status: 'running',
        submitted_at: '2026-04-16T12:01:00Z',
        active_executors: 1,
        executor_count: 2
      }
    ];

    vi.mocked(fetchRuns).mockResolvedValue(runsPage(mockJobs));
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
        run_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2
      },
      {
        run_id: 'job-2',
        graph_id: 'graph-2',
        status: 'pending',
        submitted_at: '2026-04-16T12:01:00Z',
        active_executors: 0,
        executor_count: 2
      }
    ];

    vi.mocked(fetchRuns).mockResolvedValue(runsPage(mockJobs));
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



  it('does not cancel selected jobs when the confirmation is dismissed', async () => {
    const mockJobs = [
      {
        run_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-04-16T12:00:00Z',
        active_executors: 1,
        executor_count: 2
      }
    ];

    vi.mocked(fetchRuns).mockResolvedValue(runsPage(mockJobs));
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



});
