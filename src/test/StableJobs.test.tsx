import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StableJobs from '../pages/StableJobs';
import { fetchStableJobs } from '../api';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  fetchStableJobs: vi.fn(),
}));

const renderPage = () => render(
  <TooltipProvider>
    <MemoryRouter><StableJobs /></MemoryRouter>
  </TooltipProvider>,
);

describe('StableJobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders persistent job identity and lifecycle counts', async () => {
    vi.mocked(fetchStableJobs).mockResolvedValue({ items: [{
      job_id: 'job-stable-1',
      job_name: 'Research workspace',
      graph_id: 'research_graph',
      status: 'active',
      data_generation: 2,
      latest_run_id: 'run-2',
      run_count: 4,
      schedule_count: 1,
      updated_at: '2026-08-01T12:00:00Z',
      resolved_configuration: {},
      schedules: [],
      schedule_ids: [],
      storage: {},
    }], next_page_token: null });

    renderPage();

    expect(await screen.findByText('Research workspace')).toBeInTheDocument();
    expect(screen.getByText('job-stable-1')).toBeInTheDocument();
    expect(screen.getByText('4').parentElement).toHaveTextContent('4 total');
    expect(screen.getByText('Generation 2')).toBeInTheDocument();
    expect(screen.getByLabelText('View job job-stable-1')).toHaveAttribute('href', '/jobs/job-stable-1');
    expect(fetchStableJobs).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('reloads the canonical collection with archived definitions included', async () => {
    vi.mocked(fetchStableJobs).mockImplementation(async ({ includeArchived } = {}) => includeArchived ? { items: [{
        job_id: 'job-archived',
        status: 'archived',
        data_generation: 1,
        run_count: 0,
        schedule_count: 0,
        resolved_configuration: {},
        schedules: [],
        schedule_ids: [],
        storage: {},
      }], next_page_token: null } : { items: [], next_page_token: null });

    renderPage();
    expect(await screen.findByText('No persistent jobs found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }));
    expect(await screen.findByText('job-archived')).toBeInTheDocument();
    expect(fetchStableJobs).toHaveBeenCalledWith({ includeArchived: true });
  });

  it('shows an actionable load error instead of an empty success state', async () => {
    vi.mocked(fetchStableJobs).mockRejectedValue(new Error('runtime unavailable'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('runtime unavailable');
  });
});
