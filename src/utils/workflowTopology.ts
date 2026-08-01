import type { WorkflowProgress, WorkflowProgressStep } from '../api';

export type WorkflowTopologyEdge = {
  id: string;
  source: string;
  target: string;
  event?: string;
};

export type WorkflowTopology = {
  steps: WorkflowProgressStep[];
  edges: WorkflowTopologyEdge[];
  layers: string[][];
};

const text = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const relationEdges = (steps: WorkflowProgressStep[]): WorkflowTopologyEdge[] => {
  const edges: WorkflowTopologyEdge[] = [];

  for (const step of steps) {
    const source = text(step.id);
    if (!source) continue;

    for (const target of step.children || []) {
      if (text(target)) edges.push({ id: `${source}->${target}`, source, target });
    }

    for (const parent of step.parents || []) {
      if (text(parent)) edges.push({ id: `${parent}->${source}`, source: parent, target: source });
    }
  }

  return edges;
};

/**
 * Build the public workflow graph emitted by `mn job monitor`. Explicit
 * monitor edges carry event labels; the per-step parent/child relations fill
 * in any links omitted from that list without exposing runtime-only nodes.
 */
export const buildWorkflowTopology = (progress: WorkflowProgress): WorkflowTopology => {
  const steps = progress.steps.filter((step) => Boolean(text(step.id)));
  const knownStepIds = new Set(steps.map((step) => step.id));
  const edges: WorkflowTopologyEdge[] = [];
  const edgeIndexByPair = new Map<string, number>();

  const addEdge = (edge: WorkflowTopologyEdge) => {
    if (!knownStepIds.has(edge.source) || !knownStepIds.has(edge.target) || edge.source === edge.target) return;
    const key = `${edge.source}\u0000${edge.target}`;
    const existingIndex = edgeIndexByPair.get(key);
    if (existingIndex !== undefined) {
      const existing = edges[existingIndex];
      const events = new Set([existing.event, edge.event].filter(Boolean));
      if (events.size) edges[existingIndex] = { ...existing, event: [...events].join(' · ') };
      return;
    }
    edgeIndexByPair.set(key, edges.length);
    edges.push(edge);
  };

  for (const [index, edge] of (progress.edges || []).entries()) {
    const source = text(edge.from);
    const target = text(edge.to);
    if (!source || !target) continue;
    addEdge({
      id: text(edge.id) || `${source}->${target}:${index + 1}`,
      source,
      target,
      event: text(edge.event),
    });
  }

  for (const edge of relationEdges(steps)) addEdge(edge);

  const hasDeclaredLayers = Boolean(progress.layers?.length) || steps.some((step) => typeof step.layer === 'number');
  if (!hasDeclaredLayers) return { steps, edges, layers: [] };

  const seenLayerSteps = new Set<string>();
  const layers = (progress.layers || []).map((layer) => layer.filter((stepId) => {
    if (!knownStepIds.has(stepId) || seenLayerSteps.has(stepId)) return false;
    seenLayerSteps.add(stepId);
    return true;
  })).filter((layer) => layer.length > 0);

  for (const step of steps) {
    if (seenLayerSteps.has(step.id)) continue;
    const layerIndex = typeof step.layer === 'number' && step.layer >= 0 ? step.layer : layers.length;
    while (layers.length <= layerIndex) layers.push([]);
    layers[layerIndex].push(step.id);
    seenLayerSteps.add(step.id);
  }

  return { steps, edges, layers: layers.filter((layer) => layer.length > 0) };
};
