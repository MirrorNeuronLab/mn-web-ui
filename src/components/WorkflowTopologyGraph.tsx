import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
} from '@xyflow/react';
import type { Edge, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { WorkflowProgress, WorkflowProgressStep } from '../api';
import { buildWorkflowTopology } from '../utils/workflowTopology';

type WorkflowStepNodeData = {
  index: number;
  step: WorkflowProgressStep;
  selected: boolean;
  workflowKind: string;
  onSelect: (stepId: string) => void;
};

type WorkflowTopologyNode = Node<WorkflowStepNodeData> & {
  sourcePosition: Position;
  targetPosition: Position;
};

type WorkflowTopologyGraphProps = {
  progress: WorkflowProgress;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
};

const NODE_WIDTH = 224;
const NODE_HEIGHT = 112;

const nodeStatusClass = (status: string | undefined, current: boolean, selected: boolean) => {
  if (selected) return 'border-neutral-950 bg-neutral-950 text-white shadow-lg shadow-neutral-950/15';
  if (['failed', 'cancelled', 'error'].includes(String(status || '').toLowerCase())) return 'border-red-300 bg-red-50 text-red-950';
  if (current || ['running', 'active'].includes(String(status || '').toLowerCase())) return 'border-sky-400 bg-sky-50 text-sky-950 shadow-sm';
  if (['completed', 'done', 'succeeded'].includes(String(status || '').toLowerCase())) return 'border-emerald-300 bg-emerald-50 text-emerald-950';
  return 'border-neutral-200 bg-white text-neutral-950 shadow-sm';
};

const statusDotClass = (status: string | undefined) => {
  const normalized = String(status || '').toLowerCase();
  if (['failed', 'cancelled', 'error'].includes(normalized)) return 'bg-red-500';
  if (['running', 'active'].includes(normalized)) return 'bg-sky-500';
  if (['completed', 'done', 'succeeded'].includes(normalized)) return 'bg-emerald-500';
  if (['retry_wait', 'blocked', 'paused', 'queued'].includes(normalized)) return 'bg-amber-500';
  return 'bg-neutral-400';
};

const WorkflowStepNode = ({ data }: NodeProps<Node<WorkflowStepNodeData>>) => {
  const { index, step, selected, workflowKind, onSelect } = data;
  const count = workflowKind === 'service' ? (step.ready_count || step.done_count || 0) : (step.done_count || 0);
  const agentCount = step.agents.length || step.total_count || 0;
  const selectedText = selected ? 'text-neutral-300' : 'text-neutral-500';

  return (
    <div
      aria-hidden="true"
      data-testid={`workflow-step-node-${step.id}`}
      onClick={() => onSelect(step.id)}
      className={`nodrag nopan min-h-[112px] w-[224px] cursor-pointer rounded-lg border p-3 text-left outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 ${nodeStatusClass(step.status, step.current, selected)}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-neutral-400" />
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(step.status)}`} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-xs font-semibold leading-4">{index + 1}. {step.label}</div>
          <div className={`mt-1 truncate font-mono text-[10px] ${selectedText}`} title={step.id}>{step.id}</div>
        </div>
      </div>
      <div className={`mt-3 flex items-center justify-between border-t pt-2 text-[11px] ${selected ? 'border-white/20 text-neutral-200' : 'border-current/10 text-neutral-600'}`}>
        <span className="capitalize">{step.status || 'pending'}</span>
        <span className="font-mono">{count}/{step.total_count || agentCount} · {agentCount} {agentCount === 1 ? 'agent' : 'agents'}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-neutral-400" />
    </div>
  );
};

const nodeTypes = { workflowStep: WorkflowStepNode };

const layoutTopology = (nodes: Node<WorkflowStepNodeData>[], edges: Edge[]): WorkflowTopologyNode[] => {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 44,
    ranksep: 104,
    marginx: 32,
    marginy: 32,
  });

  nodes.forEach((node) => graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    };
  });
};

const edgeTone = (status: string | undefined) => {
  const normalized = String(status || '').toLowerCase();
  if (['failed', 'cancelled', 'error'].includes(normalized)) return '#ef4444';
  if (['completed', 'done', 'succeeded'].includes(normalized)) return '#10b981';
  if (['running', 'active'].includes(normalized)) return '#0ea5e9';
  return '#a3a3a3';
};

export function WorkflowTopologyGraph({ progress, selectedStepId, onSelectStep }: WorkflowTopologyGraphProps) {
  const flowRef = useRef<ReactFlowInstance<WorkflowTopologyNode, Edge> | null>(null);
  const topology = useMemo(() => buildWorkflowTopology(progress), [progress]);
  const workflowKind = progress.workflow_kind || 'batch';
  const selectStep = useCallback((stepId: string) => onSelectStep(stepId), [onSelectStep]);

  const { nodes, edges, structureKey } = useMemo(() => {
    const rawNodes: Node<WorkflowStepNodeData>[] = topology.steps.map((step, index) => ({
      id: step.id,
      type: 'workflowStep',
      position: { x: 0, y: 0 },
      data: {
        index,
        step,
        selected: step.id === selectedStepId,
        workflowKind,
        onSelect: selectStep,
      },
    }));
    const stepById = new Map(topology.steps.map((step) => [step.id, step]));
    const rawEdges: Edge[] = topology.edges.map((edge) => {
      const source = stepById.get(edge.source);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        label: edge.event,
        animated: Boolean(source?.current && ['running', 'active'].includes(String(source.status || '').toLowerCase())),
        style: { stroke: edgeTone(source?.status), strokeWidth: source?.current ? 2 : 1.5 },
        labelStyle: { fill: '#525252', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
        labelBgPadding: [3, 2],
        labelBgBorderRadius: 3,
      };
    });

    return {
      nodes: layoutTopology(rawNodes, rawEdges),
      edges: rawEdges,
      structureKey: `${rawNodes.map((node) => node.id).join('|')}#${rawEdges.map((edge) => edge.id).join('|')}`,
    };
  }, [selectedStepId, selectStep, topology, workflowKind]);

  const fitView = useCallback(() => {
    window.requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.18, duration: 220 }));
  }, []);

  useEffect(() => {
    fitView();
  }, [fitView, structureKey]);

  if (!nodes.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
        No workflow steps reported yet.
      </div>
    );
  }

  return (
    <section aria-label="Workflow topology" className="mb-4 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
      <nav aria-label="Workflow step navigator" className="sr-only">
        {topology.steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            aria-pressed={step.id === selectedStepId}
            onClick={() => selectStep(step.id)}
          >
            {index + 1}. {step.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2">
        <div>
          <div className="text-xs font-semibold text-neutral-950">Workflow topology</div>
          <div className="text-[11px] text-neutral-500">Select a step to inspect its public agents and activity.</div>
        </div>
        <span className="text-[11px] text-neutral-500">{nodes.length} steps · {edges.length} links</span>
      </div>
      <div className="h-72 min-h-[18rem] bg-white">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowRef.current = instance;
            fitView();
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.25}
          maxZoom={1.6}
        >
          <Background color="#e5e5e5" gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}

export default WorkflowTopologyGraph;
