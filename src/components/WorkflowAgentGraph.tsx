import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Code2, Columns3, Rows3, Workflow } from 'lucide-react';
import { ReactFlow, MiniMap, Controls, Background, Panel, useNodesState, useEdgesState, Position } from '@xyflow/react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { Agent, AgentGraph } from '../api';

type AgentNodeData = {
  label: ReactNode;
};

type LayoutDirection = 'TB' | 'LR';
type GraphViewMode = 'workflow' | 'code';

type WorkflowAgentGraphProps = {
  graph: AgentGraph | null;
  agents: Agent[];
  fallbackJobId: string;
  fallbackGraphId?: string | null;
  fallbackStatus?: string;
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 92;

const getLayoutedElements = (nodes: Node<AgentNodeData>[], edges: Edge[], direction: LayoutDirection = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 130,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);
  const isHorizontal = direction === 'LR';

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};

const statusClass = (status: string) => {
  switch (status) {
    case 'running': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'completed': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'failed':
    case 'error': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'paused': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'pending': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
  }
};

const buildDisplayGraph = (
  graph: AgentGraph | null,
  agents: Agent[],
  fallbackJobId: string,
  fallbackGraphId?: string | null,
  fallbackStatus = 'unknown',
): AgentGraph => {
  const graphNodes = graph?.nodes.length ? graph.nodes : agents.map(agent => ({
    id: agent.agent_id,
    label: agent.agent_id,
    agent_type: agent.agent_type,
    type: agent.type,
    assigned_node: agent.assigned_node,
    status: agent.status,
    processed_messages: agent.processed_messages,
    mailbox_depth: agent.mailbox_depth,
  })).filter(agent => agent.id);

  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges = (graph?.edges || []).filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return {
    job_id: graph?.job_id || fallbackJobId,
    graph_id: graph?.graph_id ?? fallbackGraphId ?? null,
    status: graph?.status || fallbackStatus,
    nodes: graphNodes,
    edges: graphEdges,
    stats: {
      agent_count: graphNodes.length,
      edge_count: graphEdges.length,
      message_count: graph?.stats?.message_count ?? graphEdges.reduce((total, edge) => total + (edge.count ?? 0), 0),
      event_count: graph?.stats?.event_count ?? 0,
    },
  };
};

export function WorkflowAgentGraph({
  graph,
  agents,
  fallbackJobId,
  fallbackGraphId,
  fallbackStatus,
}: WorkflowAgentGraphProps) {
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('LR');
  const [viewMode, setViewMode] = useState<GraphViewMode>('workflow');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<AgentNodeData>, Edge> | null>(null);

  const displayGraph = useMemo(
    () => buildDisplayGraph(graph, agents, fallbackJobId, fallbackGraphId, fallbackStatus),
    [agents, fallbackGraphId, fallbackJobId, fallbackStatus, graph],
  );

  const graphCode = useMemo(() => JSON.stringify(displayGraph, null, 2), [displayGraph]);

  useEffect(() => {
    const rawNodes = displayGraph.nodes.map(agent => ({
      id: agent.id,
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div className="flex flex-col gap-1">
            <div className="truncate text-sm font-semibold text-neutral-950">{agent.label || agent.id}</div>
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
              <span className="truncate">{agent.agent_type || 'unknown'}</span>
              <span className={`rounded-full border px-2 py-0.5 capitalize ${statusClass(agent.status)}`}>{agent.status || 'unknown'}</span>
            </div>
            <div className="text-xs text-neutral-400">{agent.processed_messages ?? 0} processed / {agent.mailbox_depth ?? 0} queued</div>
          </div>
        )
      },
      style: { border: '1px solid #d4d4d4', borderRadius: 8, padding: 10, background: 'white', width: NODE_WIDTH, minHeight: NODE_HEIGHT, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)' },
    } satisfies Node<AgentNodeData>));

    const rawEdges = displayGraph.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.count > 0 ? `${edge.message_type} (${edge.count})` : `${edge.message_type} (possible)`,
      animated: displayGraph.status === 'running',
      type: 'smoothstep',
      style: {
        stroke: edge.count > 0 ? '#171717' : '#737373',
        strokeWidth: edge.count > 1 ? 2 : 1.5,
        strokeDasharray: edge.count > 0 ? undefined : '6 4',
      },
      labelStyle: { fill: '#525252', fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
    } satisfies Edge));

    const layouted = getLayoutedElements(rawNodes, rawEdges, layoutDirection);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    window.requestAnimationFrame(() => {
      flowInstance?.fitView({ padding: 0.2, duration: 300 });
    });
  }, [displayGraph, flowInstance, layoutDirection, setEdges, setNodes]);

  return (
    <div className="absolute inset-0 bg-white">
      <div className="absolute right-3 top-3 z-20 flex overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
        <button
          type="button"
          aria-label="Show graph view"
          aria-pressed={viewMode === 'workflow'}
          title="Graph view"
          onClick={() => setViewMode('workflow')}
          className={`flex h-9 items-center gap-2 border-r border-neutral-200 px-3 text-xs font-medium ${viewMode === 'workflow' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
        >
          <Workflow className="h-4 w-4" />
          Graph
        </button>
        <button
          type="button"
          aria-label="Show code view"
          aria-pressed={viewMode === 'code'}
          title="Code view"
          onClick={() => setViewMode('code')}
          className={`flex h-9 items-center gap-2 px-3 text-xs font-medium ${viewMode === 'code' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
        >
          <Code2 className="h-4 w-4" />
          Code
        </button>
      </div>

      {viewMode === 'workflow' ? (
        displayGraph.nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
            No agents reported yet.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={setFlowInstance}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Panel position="top-left" className="flex overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
              <button
                type="button"
                aria-label="Use left to right graph layout"
                title="Left to right layout"
                onClick={() => setLayoutDirection('LR')}
                className={`flex h-9 w-9 items-center justify-center border-r border-neutral-200 ${layoutDirection === 'LR' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                <Columns3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Use top to bottom graph layout"
                title="Top to bottom layout"
                onClick={() => setLayoutDirection('TB')}
                className={`flex h-9 w-9 items-center justify-center ${layoutDirection === 'TB' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                <Rows3 className="h-4 w-4" />
              </button>
            </Panel>
            <Background color="#ccc" gap={16} />
            <MiniMap />
            <Controls />
          </ReactFlow>
        )
      ) : (
        <div className="absolute inset-0 overflow-auto bg-neutral-950 p-4 pt-16">
          <pre className="font-mono text-xs leading-5 text-neutral-200">{graphCode}</pre>
        </div>
      )}
    </div>
  );
}

export default WorkflowAgentGraph;
