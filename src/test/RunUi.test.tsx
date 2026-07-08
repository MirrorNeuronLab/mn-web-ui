import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RunUi from '../pages/RunUi';
import { fetchRunUi } from '../api';

vi.mock('../api', () => ({
  fetchRunUi: vi.fn(),
}));

const renderRunUi = (path = '/runs/run-1/ui') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/runs/:runId/ui" element={<RunUi />} />
    </Routes>
  </MemoryRouter>,
);

describe('RunUi', () => {
  let replaceLocation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceLocation = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        replace: replaceLocation,
      },
    });
  });

  it('resolves the run web UI through mn-api before redirecting', async () => {
    vi.mocked(fetchRunUi).mockResolvedValue({
      run_id: 'run-1',
      ui: {
        schema_version: 1,
        adapter: 'gradio',
        kind: 'output',
        title: 'Blueprint Run',
        refresh_seconds: 2,
        components: [],
        metadata: {},
      },
      web_ui: {
        adapter: 'gradio',
        kind: 'output',
        url: 'http://127.0.0.1:61000/dashboard',
        title: 'Blueprint Dashboard',
        status: 'running',
        metadata: {},
      },
      job: {},
      run: {},
      events: [],
    });

    renderRunUi('/runs/run-1/ui?panel=events');

    await waitFor(() => {
      expect(fetchRunUi).toHaveBeenCalledWith('run-1');
      expect(replaceLocation).toHaveBeenCalledWith('http://127.0.0.1:61000/dashboard?panel=events');
    });
    expect(screen.getByRole('link', { name: /open web ui/i })).toHaveAttribute(
      'href',
      'http://127.0.0.1:61000/dashboard?panel=events',
    );
  });

  it('shows a recoverable message when mn-api has no registered web UI URL', async () => {
    vi.mocked(fetchRunUi).mockResolvedValue({
      run_id: 'run-1',
      ui: {
        schema_version: 1,
        adapter: 'gradio',
        kind: 'output',
        title: 'Blueprint Run',
        refresh_seconds: 2,
        components: [],
        metadata: {},
      },
      web_ui: {
        adapter: 'gradio',
        kind: 'output',
        url: '',
        title: 'Blueprint Dashboard',
        status: 'starting',
        metadata: {},
      },
      job: {},
      run: {},
      events: [],
    });

    renderRunUi();

    expect(await screen.findByText('No web UI is registered for this run yet.')).toBeInTheDocument();
    expect(replaceLocation).not.toHaveBeenCalled();
  });
});
