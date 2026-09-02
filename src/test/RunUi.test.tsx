import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JobUi from '../pages/JobUi';
import { fetchJobUi } from '../api';

vi.mock('../api', () => ({
  fetchJobUi: vi.fn(),
}));

const renderJobUi = (path = '/jobs/job-1/ui') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/jobs/:jobId/ui" element={<JobUi />} />
    </Routes>
  </MemoryRouter>,
);

describe('JobUi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the job web UI through mn-api and keeps its service behind the local proxy', async () => {
    vi.mocked(fetchJobUi).mockResolvedValue({
      job_id: 'job-1',
      ui: {
        schema_version: 'mn.web_ui.external.v1',
        renderer: 'external-url',
        job_id: 'job-1',
        title: 'Blueprint Web UI',
        metadata: {},
      },
      web_ui: {
        adapter: 'external-url',
        kind: 'service',
        url: 'http://127.0.0.1:61000/dashboard',
        title: 'Blueprint Dashboard',
        status: 'running',
        metadata: {},
      },
    });

    renderJobUi('/jobs/job-1/ui?panel=events');

    await waitFor(() => {
      expect(fetchJobUi).toHaveBeenCalledWith('job-1');
    });
    expect(screen.getByTitle('Blueprint Dashboard')).toHaveAttribute(
      'src',
      '/job-ui-proxy/job-1/61000/dashboard?panel=events',
    );
    expect(screen.getByTitle('Blueprint Dashboard')).toHaveClass('h-full', 'w-full', 'border-0');
    expect(screen.queryByRole('link', { name: /open in tab/i })).not.toBeInTheDocument();
  });

  it('keeps the root slash and service query when framing a root dashboard', async () => {
    vi.mocked(fetchJobUi).mockResolvedValue({
      job_id: 'job-1',
      ui: {
        schema_version: 'mn.web_ui.external.v1',
        renderer: 'external-url',
        job_id: 'job-1',
        title: 'Blueprint Web UI',
        metadata: {},
      },
      web_ui: {
        adapter: 'external-url',
        kind: 'service',
        url: 'http://mn-dw-job-example:61001/?control=1',
        title: 'Simulator',
        status: 'running',
        metadata: {},
      },
    });

    renderJobUi();

    expect(await screen.findByTitle('Simulator')).toHaveAttribute(
      'src',
      '/job-ui-proxy/job-1/61001/?control=1',
    );
  });

  it('shows a recoverable message when mn-api has no registered web UI URL', async () => {
    vi.mocked(fetchJobUi).mockResolvedValue({
      job_id: 'job-1',
      ui: {
        schema_version: 'mn.web_ui.external.v1',
        renderer: 'external-url',
        job_id: 'job-1',
        title: 'Blueprint Web UI',
        metadata: {},
      },
      web_ui: {
        adapter: 'external-url',
        kind: 'service',
        url: '',
        title: 'Blueprint Dashboard',
        status: 'starting',
        metadata: {},
      },
    });

    renderJobUi();

    expect(await screen.findByText('No web UI is registered for this job yet.')).toBeInTheDocument();
  });

  it('does not frame a paused service', async () => {
    vi.mocked(fetchJobUi).mockResolvedValue({
      job_id: 'job-1',
      ui: { schema_version: 'mn.web_ui.external.v1', renderer: 'external-url', job_id: 'job-1', title: 'Blueprint Web UI', metadata: {} },
      web_ui: { adapter: 'external-url', kind: 'service', url: 'http://127.0.0.1:61000/', title: 'Blueprint Dashboard', status: 'paused', metadata: {} },
    });

    renderJobUi();

    expect(await screen.findByText('This job is paused. Resume it to reopen its web UI.')).toBeInTheDocument();
    expect(screen.queryByTitle('Blueprint Dashboard')).not.toBeInTheDocument();
  });
});
