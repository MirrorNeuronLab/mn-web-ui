import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WorkflowProgressPanel from '../components/WorkflowProgressPanel';
import type { WorkflowProgress } from '../api';

describe('WorkflowProgressPanel activity timeline', () => {
  it('renders mixed activity categories and filters to tool events', () => {
    const progress: WorkflowProgress = {
      schema_version: 1,
      job_id: 'job-observe',
      workflow_id: 'observe-workflow',
      name: 'Observe Workflow',
      description: '',
      status: 'running',
      workflow_kind: 'batch',
      elapsed_seconds: 5,
      agent_count: { done: 0, running: 1, idle: 0, ready: 1, failed: 0, total: 1 },
      current_step_id: 'research',
      current_step: null,
      steps: [
        {
          id: 'research',
          label: 'Research',
          goal: 'Browse public sources',
          status: 'running',
          current: true,
          done_count: 0,
          running_count: 1,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 5,
          recent_events: [
            {
              timestamp: '2026-06-12T17:38:01Z',
              type: 'agent_activity',
              category: 'agent',
              step_id: 'research',
              agent_id: 'financial_market_researcher',
              message: 'Planning public research',
            },
            {
              timestamp: '2026-06-12T17:38:02Z',
              type: 'tool_call_completed',
              category: 'tool',
              step_id: 'research',
              agent_id: 'financial_market_researcher',
              message: 'Browsed consumerfinance.gov',
              tool_name: 'w3m',
              target: 'https://www.consumerfinance.gov/consumer-tools/',
              result_summary: 'Consumer tools summary',
            },
            {
              timestamp: '2026-06-12T17:38:03Z',
              type: 'docker_worker_command_completed',
              category: 'system',
              step_id: 'research',
              agent_id: 'financial_market_researcher',
              message: 'DockerWorker command completed',
            },
          ],
          agents: [{ id: 'financial_market_researcher', role: 'Researcher', working_on: 'Browse public sources', model: 'runtime', status: 'running', progress: 0.5, live: false, elapsed_seconds: 5 }],
        },
      ],
      messages: [],
      recent_events: [],
    };

    render(<WorkflowProgressPanel progress={progress} details={null} />);

    expect(screen.getByText(/Planning public research/)).toBeInTheDocument();
    expect(screen.getByText(/Browsed consumerfinance.gov/)).toBeInTheDocument();
    expect(screen.getByText(/DockerWorker command completed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tool' }));

    expect(screen.getByText(/Browsed consumerfinance.gov/)).toBeInTheDocument();
    expect(screen.queryByText(/Planning public research/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DockerWorker command completed/)).not.toBeInTheDocument();
  });
});
