import type { Agent, AgentGraph, WorkflowProgress } from '../api';

type DisplayRecord = {
  id?: string | null;
  agent_id?: string | null;
  alias?: string | null;
  display_name?: string | null;
  label?: string | null;
  role?: string | null;
};

const INFRASTRUCTURE_AGENT_IDS = new Set(['runtime', 'workflow_manifest_executor']);
const LOWERED_AGENT_TYPES = new Set(['step_source', 'step_sink', 'step_join', 'router', 'aggregator']);

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
  return knownText(record?.alias, record?.display_name, record?.label, record?.role, id) || 'Unnamed agent';
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
        // Counts are not reported by workflow-progress snapshots; mark them so
        // the UI renders a labeled empty state instead of a measured zero.
        countsUnknown: true,
      } as AgentGraph['nodes'][number]);
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

const isLoweredNode = (node: { id: string; agent_type?: string | null }): boolean => (
  LOWERED_AGENT_TYPES.has(String(node.agent_type || '').toLowerCase())
  || /__(?:start|end|fork(?:_\d+)?|join(?:_\d+)?)$/.test(node.id)
  || node.id === 'workflow__terminal'
);

const isPublicNode = (node: { id: string; agent_type?: string | null }): boolean => (
  !INFRASTRUCTURE_AGENT_IDS.has(node.id) && !isLoweredNode(node)
);

export const buildDisplayGraph = (
  graph: AgentGraph | null,
  agents: Agent[],
  fallbackJobId: string,
  fallbackGraphId?: string | null,
  fallbackStatus = 'unknown',
  progress?: WorkflowProgress | null,
): AgentGraph => {
  const progressGraph = buildProgressGraph(progress, fallbackJobId, fallbackGraphId, fallbackStatus);
  // Union (by stable id) instead of length-based source flipping: the public
  // workflow snapshot declares every agent while the live registry carries
  // fresher status. Merging keeps node identity stable across polls so links
  // never vanish when counts cross. Runtime-only control nodes stay hidden:
  // live-registry ids scoped with `__` (e.g. `detect__watcher`) describe
  // runtime internals, not public agents.
  const liveNodes = (graph?.nodes ?? []).filter((node) => isPublicNode(node) && !node.id.includes('__'));
  const progressNodes = progressGraph?.nodes ?? [];
  const mergedById = new Map<string, (typeof liveNodes)[number]>();
  for (const node of progressNodes) mergedById.set(node.id, node);
  for (const node of liveNodes) mergedById.set(node.id, node);
  const mergedNodes = [...mergedById.values()];
  const mergedEdgesById = new Map<string, NonNullable<AgentGraph['edges']>[number]>();
  for (const edge of progressGraph?.edges ?? []) mergedEdgesById.set(edge.id, edge);
  for (const edge of graph?.edges ?? []) {
    if (!mergedEdgesById.has(edge.id)) mergedEdgesById.set(edge.id, edge);
  }
  const mergedEdges = [...mergedEdgesById.values()];
  const mergedSource: AgentGraph | null = (mergedNodes.length || graph || progressGraph)
    ? {
      job_id: graph?.job_id || progressGraph?.job_id || fallbackJobId,
      graph_id: graph?.graph_id ?? progressGraph?.graph_id ?? fallbackGraphId ?? null,
      status: graph?.status || progressGraph?.status || fallbackStatus,
      nodes: mergedNodes,
      edges: mergedEdges,
      stats: {
        agent_count: mergedNodes.length,
        edge_count: mergedEdges.length,
        message_count: graph?.stats?.message_count ?? progressGraph?.stats?.message_count ?? mergedEdges.reduce((total, edge) => total + (edge.count ?? 0), 0),
        event_count: graph?.stats?.event_count ?? progressGraph?.stats?.event_count ?? 0,
      },
    }
    : null;
  const sourceGraph = mergedSource;
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
