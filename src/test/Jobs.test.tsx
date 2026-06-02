import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Jobs from '../pages/Jobs';
import { cancelJob, clearJobs, fetchJobs, pauseJob } from '../api';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchJobs: vi.fn(),
    pauseJob: vi.fn(),
    cancelJob: vi.fn(),
    clearJobs: vi.fn(),
  };
});

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('Jobs Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton loading state initially', () => {
    vi.mocked(fetchJobs).mockReturnValue(new Promise(() => {}));
    
    const { container } = renderWithRouter(<Jobs />);
    
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders "No jobs found" when data is empty', async () => {
    vi.mocked(fetchJobs).mockResolvedValue([]);

    renderWithRouter(<Jobs />);

    await waitFor(() => {
      expect(screen.getByText('No jobs found.')).toBeInTheDocument();
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

    renderWithRouter(<Jobs />);

    await waitFor(() => {
      expect(screen.getByText('test-job-123')).toBeInTheDocument();
    });

    expect(screen.getByText('simple-graph')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText('View details for test-job-123')).toHaveAttribute('href', '/jobs/test-job-123');
    expect(fetchJobs).toHaveBeenCalledWith({ includeTerminal: false });
  });

  it('reloads with terminal jobs when the past jobs switch is enabled', async () => {
    vi.mocked(fetchJobs)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          job_id: 'done-job-1',
          graph_id: 'tax-graph',
          status: 'completed',
          submitted_at: '2026-04-16T12:00:00Z',
          active_executors: 0,
          executor_count: 0,
        },
      ]);

    renderWithRouter(<Jobs />);

    await waitFor(() => {
      expect(screen.getByText('No jobs found.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Past jobs' }));

    await waitFor(() => {
      expect(screen.getByText('done-job-1')).toBeInTheDocument();
    });

    expect(fetchJobs).toHaveBeenNthCalledWith(1, { includeTerminal: false });
    expect(fetchJobs).toHaveBeenNthCalledWith(2, { includeTerminal: true });
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
    vi.mocked(pauseJob).mockResolvedValue({ status: 'paused' });

    renderWithRouter(<Jobs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    const pauseButton = screen.getByRole('button', { name: 'Pause' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(pauseButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Select job job-1'));
    fireEvent.click(screen.getByLabelText('Select job job-2'));

    expect(screen.getByRole('button', { name: 'Pause (2)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel (2)' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Pause (2)' }));

    await waitFor(() => {
      expect(pauseJob).toHaveBeenCalledWith('job-1');
      expect(pauseJob).toHaveBeenCalledWith('job-2');
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
    vi.mocked(cancelJob).mockResolvedValue({ status: 'cancelled' });

    renderWithRouter(<Jobs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Select job job-1'));
    fireEvent.click(screen.getByLabelText('Select job job-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel (2)' }));

    await waitFor(() => {
      expect(cancelJob).toHaveBeenCalledWith('job-1');
      expect(cancelJob).toHaveBeenCalledWith('job-2');
    });
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
    vi.mocked(clearJobs).mockResolvedValue({ cleared_count: 1 });

    renderWithRouter(<Jobs />);

    await waitFor(() => {
      expect(screen.getByText('job-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(clearJobs).toHaveBeenCalledOnce();
      expect(screen.getByText('No jobs found.')).toBeInTheDocument();
    });
  });
});
