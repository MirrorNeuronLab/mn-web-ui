import type { Agent, AgentGraph, WorkflowProgress } from '../api';

type DisplayRecord = {
  id?: string | null;
  agent_id?: string | null;
  alias?: string | null;
  display_name?: string | null;
  label?: string | null;
  role?: string | null;
};

const INFRASTRUCTURE_AGENT_IDS = new Set(['runtime', 'workflow_manifest_executor', 'web_ui_dashboard']);

const knownText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== 'unknown') return trimmed;
  }
  return undefined;
};

export const displayAgentName = (record: DisplayRecord | null | undefined): string => {
  const id = knownText(record?.id, record?.agent_id);
  if (id === 'runtime' && !knownText(record?.alias, record?.display_name, record?.label, record?.role)) {
    return 'System Runtime';
  }
  return knownText(record?.alias, record?.display_name, record?.label, record?.role, id) || 'unknown';
};

const buildProgressGraph = (
  progress: WorkflowProgress | null | undefined,
  fallbackJobId: string,
  fallbackGraphId?: string | null,
  fallbackStatus = 'unknown',
): AgentGraph | null => {
  const steps = progress?.steps || [];
  const nodes: AgentGraph['nodes'] = [];
  const primaryAgentByStep = new Map<string, string>();

  for (const step of steps) {
    for (const [index, agent] of (step.agents || []).entries()) {
      const id = knownText(agent.id) || `${step.id || 'step'}:${index + 1}`;
      if (!primaryAgentByStep.has(step.id || '')) {
        primaryAgentByStep.set(step.id || '', id);
      }
      nodes.push({
        id,
        alias: agent.alias,
        display_name: agent.display_name,
        label: displayAgentName({ ...agent, id }),
        role: agent.role,
        agent_type: 'workflow',
        type: agent.live ? 'live worker' : 'worker',
        assigned_node: knownText(agent.assigned_node) || 'workflow/runtime',
        status: agent.status || step.status || 'pending',
        processed_messages: 0,
        mailbox_depth: agent.mailbox_depth ?? 0,
      });
    }
  }

  if (nodes.length === 0) return null;

  const edges: AgentGraph['edges'] = (progress?.edges || []).flatMap((edge, index) => {
    const source = primaryAgentByStep.get(edge.from);
    const target = primaryAgentByStep.get(edge.to);
    if (!source || !target || source === target) return [];
    return [{
      id: String(edge.id || `${edge.from}->${edge.to}:${edge.event || index}`),
      source,
      target,
      message_type: edge.event || 'workflow',
      count: 0,
      last_seen_at: null,
      source_event: 'workflow_progress',
    }];
  });

  return {
    job_id: progress?.job_id || fallbackJobId,
    graph_id: progress?.workflow_id ?? fallbackGraphId ?? null,
    status: progress?.status || fallbackStatus,
    nodes,
    edges,
    stats: {
      agent_count: nodes.length,
      edge_count: edges.length,
      message_count: 0,
      event_count: progress?.recent_events?.length ?? 0,
    },
  };
};

const shouldUseProgressGraph = (graph: AgentGraph | null, progressGraph: AgentGraph | null): boolean => {
  if (!progressGraph) return false;
  if (!graph?.nodes?.length) return true;
  if (graph.nodes.every((node) => INFRASTRUCTURE_AGENT_IDS.has(node.id))) return true;
  // The runtime registry can be sparse while later workflow phases have not
  // started. The public workflow snapshot already contains every declared
  // agent, so prefer it whenever it is more complete than the live registry.
  return progressGraph.nodes.length > graph.nodes.length;
};

export const buildDisplayGraph = (
  graph: AgentGraph | null,
  agents: Agent[],
  fallbackJobId: string,
  fallbackGraphId?: string | null,
  fallbackStatus = 'unknown',
  progress?: WorkflowProgress | null,
): AgentGraph => {
  const progressGraph = buildProgressGraph(progress, fallbackJobId, fallbackGraphId, fallbackStatus);
  const sourceGraph = shouldUseProgressGraph(graph, progressGraph) ? progressGraph : graph;
  const graphNodes = sourceGraph?.nodes.length ? sourceGraph.nodes.map(node => ({
    ...node,
    label: displayAgentName(node),
  })) : agents.map(agent => ({
    id: agent.agent_id,
    alias: agent.alias,
    display_name: agent.display_name,
    label: displayAgentName({
      id: agent.agent_id,
      alias: agent.alias,
      display_name: agent.display_name,
      label: agent.label,
      role: agent.role,
    }),
    role: agent.role,
    agent_type: agent.agent_type,
    type: agent.type,
    assigned_node: agent.assigned_node,
    status: agent.status,
    processed_messages: agent.processed_messages,
    mailbox_depth: agent.mailbox_depth,
  })).filter(agent => agent.id);

  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges = (sourceGraph?.edges || []).filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return {
    job_id: sourceGraph?.job_id || fallbackJobId,
    graph_id: sourceGraph?.graph_id ?? fallbackGraphId ?? null,
    status: sourceGraph?.status || fallbackStatus,
    nodes: graphNodes,
    edges: graphEdges,
    stats: {
      agent_count: graphNodes.length,
      edge_count: graphEdges.length,
      message_count: sourceGraph?.stats?.message_count ?? graphEdges.reduce((total, edge) => total + (edge.count ?? 0), 0),
      event_count: sourceGraph?.stats?.event_count ?? 0,
    },
  };
};
