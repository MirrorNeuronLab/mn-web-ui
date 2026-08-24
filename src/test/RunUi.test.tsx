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
        schema_version: 'mn.web_ui.json_render.v1',
        renderer: 'json-render',
        job_id: 'job-1',
        title: 'Blueprint Web UI',
        spec: {},
        metadata: {},
      },
      web_ui: {
        adapter: 'json-render',
        kind: 'output',
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
    expect(screen.getByRole('link', { name: /open in tab/i })).toHaveAttribute(
      'href',
      '/job-ui-proxy/job-1/61000/dashboard?panel=events',
    );
  });

  it('shows a recoverable message when mn-api has no registered web UI URL', async () => {
    vi.mocked(fetchJobUi).mockResolvedValue({
      job_id: 'job-1',
      ui: {
        schema_version: 'mn.web_ui.json_render.v1',
        renderer: 'json-render',
        job_id: 'job-1',
        title: 'Blueprint Web UI',
        spec: {},
        metadata: {},
      },
      web_ui: {
        adapter: 'json-render',
        kind: 'output',
        url: '',
        title: 'Blueprint Dashboard',
        status: 'starting',
        metadata: {},
      },
    });

    renderJobUi();

    expect(await screen.findByText('No web UI is registered for this job yet.')).toBeInTheDocument();
  });
});
