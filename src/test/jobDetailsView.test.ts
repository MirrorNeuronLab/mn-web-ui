import { describe, expect, it } from 'vitest';
import type { AgentGraph, JobDetails, JobEvent } from '../api';
import { blueprintWebUiInfo, buildFallbackWorkflowProgress, webUiInfoFromRecord } from '../utils/jobDetailsView';

describe('job details view helpers', () => {
  it('builds fallback workflow progress from compact job details and graph data', () => {
    const details = {
      job: {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        submitted_at: '2026-06-12T12:00:00Z',
        job_type: 'service',
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
      summary: { title: 'Fallback graph' },
    } satisfies JobDetails;
    const events: JobEvent[] = [
      {
        timestamp: '2026-06-12T12:00:01Z',
        type: 'sandbox_job_completed',
        agent_id: 'agent-1',
      },
    ];
    const graph = {
      job_id: 'job-1',
      graph_id: 'graph-1',
      status: 'running',
      nodes: [
        {
          id: 'agent-1',
          label: 'Agent One',
          agent_type: 'stream',
          type: 'stream',
          assigned_node: 'local',
          status: 'running',
          processed_messages: 2,
          mailbox_depth: 0,
        },
      ],
      edges: [],
      stats: { agent_count: 1, edge_count: 0, message_count: 0, event_count: 1 },
    } satisfies AgentGraph;

    const progress = buildFallbackWorkflowProgress(details, events, graph);

    expect(progress).toEqual(expect.objectContaining({
      job_id: 'job-1',
      workflow_id: 'graph-1',
      workflow_kind: 'service',
      status: 'running',
    }));
    expect(progress.current_step).toEqual(expect.objectContaining({
      id: 'runtime-agents',
      idle_count: 1,
      total_count: 1,
    }));
    expect(progress.current_step?.agents[0]).toEqual(expect.objectContaining({
      id: 'agent-1',
      status: 'idle',
      live: true,
      tools: 2,
    }));
  });

  it('discovers safe web ui handles from details and arbitrary records', () => {
    expect(webUiInfoFromRecord({
      web_ui: { url: 'http://localhost:61000', title: 'Nested Dashboard', status: 'running' },
    })).toEqual({
      url: 'http://localhost:61000/',
      title: 'Nested Dashboard',
      status: 'running',
    });

    expect(blueprintWebUiInfo({
      job: {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        metadata: {
          web_ui_service: {
            url: 'https://example.com/dashboard',
            title: 'Example Dashboard',
          },
        },
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    })).toEqual({
      url: 'https://example.com/dashboard',
      title: 'Example Dashboard',
      status: undefined,
    });
  });
});
