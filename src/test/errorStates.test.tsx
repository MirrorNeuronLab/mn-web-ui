import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import FailurePanel from '../components/FailurePanel';
import ObservabilitySummaryPanel from '../components/ObservabilitySummaryPanel';
import ErrorBoundary from '../components/ErrorBoundary';
import NotFound from '../pages/NotFound';
import WorkflowProgressPanel from '../components/WorkflowProgressPanel';
import { fetchSystemSummary } from '../api';
import type { ErrorEnvelope } from '../api';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', () => ({
  fetchSystemSummary: vi.fn(),
}));

const renderDashboard = () => render(
  <TooltipProvider>
    <Dashboard />
  </TooltipProvider>,
);

describe('page and panel error states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows a visible alert instead of measured zeros when the summary fetch fails', async () => {
    vi.mocked(fetchSystemSummary).mockRejectedValue(new Error('network down'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(/network down/);
    expect(screen.queryByText('0 cores')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders untrusted artifact links as plain text instead of clickable javascript: URLs', () => {
    render(
      <FailurePanel
        failure={{
          code: 'runtime.failure',
          desc: 'Boom',
          links: [{ rel: 'artifact', url: 'javascript:alert(1)' }],
        } as unknown as ErrorEnvelope}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('(unavailable link)')).toBeInTheDocument();
  });

  it('renders https artifact links with noopener', () => {
    render(
      <FailurePanel
        failure={{
          code: 'runtime.failure',
          desc: 'Boom',
          links: [{ rel: 'artifact', url: 'https://example.com/a.log' }],
        } as unknown as ErrorEnvelope}
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/a.log');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('omits observability artifacts with non-openable URLs', () => {
    const { container } = render(
      <ObservabilitySummaryPanel
        summary={{ counts: { events: 1 } }}
        artifacts={[{ artifact_id: 'events_jsonl', url: 'data:text/plain,evil' }]}
      />,
    );

    expect(container.querySelector('a')).toBeNull();
  });

  it('shows a 404 view for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/nope/nothing-here']}>
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });

  it('error boundary catches a crashing view instead of blanking the app', () => {
    const Crashing = () => {
      throw new Error('bad payload');
    };
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Crashing />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('workflow progress shows a retry affordance when disconnected without data', () => {
    const onRetry = vi.fn();
    render(
      <WorkflowProgressPanel
        progress={null}
        streamState="disconnected"
        streamError="Workflow progress stream disconnected."
        onRetryStream={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/disconnected/);
    screen.getByRole('button', { name: 'Retry connection' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
