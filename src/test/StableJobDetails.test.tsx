import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StableJobDetails from '../pages/StableJobDetails';
import {
  archiveStableJob,
  cancelRun,
  deleteRun,
  deleteStableJob,
  fetchStableJob,
  fetchStableJobRuns,
  pauseRun,
  resetStableJobData,
  resumeRun,
  startStableJobRun,
} from '../api';
import { ConfirmActionDialogHost } from '../components/ui/confirm-action-dialog';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  archiveStableJob: vi.fn(),
  cancelRun: vi.fn(),
  deleteRun: vi.fn(),
  deleteStableJob: vi.fn(),
  fetchStableJob: vi.fn(),
  fetchStableJobRuns: vi.fn(),
  pauseRun: vi.fn(),
  resetStableJobData: vi.fn(),
  resumeRun: vi.fn(),
  startStableJobRun: vi.fn(),
}));

const stableJob = {
  job_id: 'job-stable-1',
  blueprint_id: 'researcher',
  graph_id: 'research_graph',
  job_name: 'Research workspace',
  owner_node: 'mn@local',
  status: 'active',
  data_generation: 2,
  latest_run_id: 'run-old',
  run_count: 1,
  schedule_count: 0,
  updated_at: '2026-08-01T12:00:00Z',
  resolved_configuration: { mode: 'safe' },
  schedules: [],
  schedule_ids: [],
  storage: { rag: { access: 'write' } },
};

const renderPage = () => render(
  <TooltipProvider>
    <MemoryRouter initialEntries={['/jobs/job-stable-1']}>
      <Routes>
        <Route path="/jobs/:jobId" element={<StableJobDetails />} />
        <Route path="/jobs" element={<div>Jobs destination</div>} />
        <Route path="/runs/:id" element={<div>Run destination</div>} />
      </Routes>
    </MemoryRouter>
    <ConfirmActionDialogHost />
  </TooltipProvider>,
);

describe('StableJobDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchStableJob).mockResolvedValue(stableJob);
    vi.mocked(fetchStableJobRuns).mockResolvedValue({
      items: [{
        run_id: 'run-old',
        job_id: 'job-stable-1',
        status: 'completed',
        attempt: 1,
        submitted_at: '2026-08-01T11:00:00Z',
      }],
      next_page_token: null,
    });
  });

  it('renders persistent configuration separately from execution history', async () => {
    renderPage();

    expect(await screen.findByText('Research workspace')).toBeInTheDocument();
    expect(screen.getByText('job-stable-1')).toBeInTheDocument();
    expect(screen.getByText('run-old')).toBeInTheDocument();
    expect(screen.getByLabelText('Job and run status')).toHaveTextContent('Job statusActive');
    expect(screen.getByLabelText('Job and run status')).toHaveTextContent('Latest runCompleted');
    expect(screen.getByText('Data generation')).toBeInTheDocument();
    expect(screen.getByLabelText('View run run-old')).toHaveAttribute('href', '/runs/run-old');
    expect(fetchStableJob).toHaveBeenCalledWith('job-stable-1');
    expect(fetchStableJobRuns).toHaveBeenCalledWith('job-stable-1');
  });

  it('starts a fresh run and navigates with run_id, never stable job_id', async () => {
    vi.mocked(startStableJobRun).mockResolvedValue({
      run_id: 'run-new',
      job_id: 'job-stable-1',
      status: 'pending',
      replaced_run_ids: [],
      cleanup_deferred: false,
      cleanup_pending_nodes: [],
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }));
    expect(await screen.findByText('Start a new run?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Start run' }).at(-1)!);

    expect(await screen.findByText('Run destination')).toBeInTheDocument();
    expect(startStableJobRun).toHaveBeenCalledWith('job-stable-1');
  });

  it('offers destructive replacement instead of Start when a service run exists', async () => {
    vi.mocked(fetchStableJob).mockResolvedValue({
      ...stableJob,
      type: 'service',
    });
    vi.mocked(startStableJobRun).mockResolvedValue({
      run_id: 'run-replacement',
      job_id: 'job-stable-1',
      status: 'pending',
      replaced_run_ids: ['run-old'],
      cleanup_deferred: true,
      cleanup_pending_nodes: ['mn@offline'],
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Replace run…' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace run…' }));
    expect(await screen.findByText('Replace the service run?')).toBeInTheDocument();
    expect(screen.getByText(/Active work will be cancelled/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace run' }));

    expect(await screen.findByText('Run destination')).toBeInTheDocument();
    expect(startStableJobRun).toHaveBeenCalledWith('job-stable-1', {}, true);
  });

  it('uses only type service for the single-run UI', async () => {
    vi.mocked(fetchStableJob).mockResolvedValue({
      ...stableJob,
      stream_mode: 'live',
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Start run' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Replace run…' })).not.toBeInTheDocument();
  });

  it('keeps an active job startable when it has no run', async () => {
    vi.mocked(fetchStableJob).mockResolvedValue({
      ...stableJob,
      latest_run_id: null,
      run_count: 0,
    });
    vi.mocked(fetchStableJobRuns).mockResolvedValue({ items: [], next_page_token: null });
    renderPage();

    const statuses = await screen.findByLabelText('Job and run status');
    expect(statuses).toHaveTextContent('Job statusActive');
    expect(statuses).toHaveTextContent('Latest runNot started');
    expect(screen.getByRole('button', { name: 'Start run' })).toBeEnabled();
  });

  it('archives and resets only after explicit confirmation', async () => {
    vi.mocked(archiveStableJob).mockResolvedValue({ job_id: 'job-stable-1', status: 'archived' });
    vi.mocked(resetStableJobData).mockResolvedValue({
      operation_id: 'op-reset-1',
      kind: 'reset_job_data',
      status: 'running',
      counters: { total: 0, started: 0, finished: 0, succeeded: 0, failed: 0, deferred: 0 },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Archive this job?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive job' }));
    await waitFor(() => expect(archiveStableJob).toHaveBeenCalledWith('job-stable-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset data' }));
    expect(await screen.findByText('Reset shared job data?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset data' }).at(-1)!);
    await waitFor(() => expect(resetStableJobData).toHaveBeenCalledWith('job-stable-1'));
  });

  it('controls and deletes runs without deleting shared job data', async () => {
    vi.mocked(fetchStableJobRuns).mockResolvedValue({
      items: [
        { run_id: 'run-live', job_id: 'job-stable-1', status: 'running', attempt: 1 },
        { run_id: 'run-done', job_id: 'job-stable-1', status: 'completed', attempt: 1 },
      ],
      next_page_token: null,
    });
    vi.mocked(pauseRun).mockResolvedValue({ run_id: 'run-live', status: 'paused' });
    vi.mocked(deleteRun).mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByLabelText('Pause run run-live'));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause run' }));
    await waitFor(() => expect(pauseRun).toHaveBeenCalledWith('run-live'));

    fireEvent.click(screen.getByLabelText('Delete run run-done'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete run' }));
    await waitFor(() => expect(deleteRun).toHaveBeenCalledWith('run-done'));
    expect(deleteStableJob).not.toHaveBeenCalled();
    expect(cancelRun).not.toHaveBeenCalled();
    expect(resumeRun).not.toHaveBeenCalled();
  });

  it('permanently deletes the stable job only after confirmation', async () => {
    vi.mocked(deleteStableJob).mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Permanently delete this job?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByText('Jobs destination')).toBeInTheDocument();
    expect(deleteStableJob).toHaveBeenCalledWith('job-stable-1');
  });
});
