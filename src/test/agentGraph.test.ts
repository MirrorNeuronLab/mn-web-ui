import { describe, expect, it } from 'vitest';
import type { AgentGraph, WorkflowProgress } from '../api';
import { buildDisplayGraph } from '../utils/agentGraph';

describe('buildDisplayGraph', () => {
  it('prefers the complete public workflow over a partial runtime registry', () => {
    const runtimeGraph: AgentGraph = {
      job_id: 'job-vc',
      graph_id: 'vc-assistant',
      status: 'running',
      nodes: [
        { id: 'watcher', label: 'Watcher', status: 'done' },
        { id: 'grouper', label: 'Grouper', status: 'done' },
      ],
      edges: [],
      stats: { agent_count: 2, edge_count: 0, message_count: 0, event_count: 0 },
    } as unknown as AgentGraph;
    const progress = {
      job_id: 'job-vc',
      workflow_id: 'vc-assistant',
      status: 'running',
      steps: [
        { id: 'detect', status: 'done', agents: [{ id: 'watcher', status: 'done' }] },
        { id: 'assemble', status: 'done', agents: [{ id: 'grouper', status: 'done' }] },
        { id: 'plan', status: 'queued', agents: [{ id: 'research_planner', status: 'pending' }] },
        { id: 'score', status: 'pending', agents: [{ id: 'berkus_scorer', status: 'pending' }] },
      ],
      edges: [
        { id: 'detect_to_assemble', from: 'detect', to: 'assemble', event: 'detected' },
        { id: 'assemble_to_plan', from: 'assemble', to: 'plan', event: 'assembled' },
        { id: 'plan_to_score', from: 'plan', to: 'score', event: 'planned' },
      ],
      recent_events: [],
    } as unknown as WorkflowProgress;

    const display = buildDisplayGraph(runtimeGraph, [], 'job-vc', 'vc-assistant', 'running', progress);

    expect(display.nodes.map((node) => node.id)).toEqual([
      'watcher',
      'grouper',
      'research_planner',
      'berkus_scorer',
    ]);
    expect(display.edges).toHaveLength(3);
  });
});
