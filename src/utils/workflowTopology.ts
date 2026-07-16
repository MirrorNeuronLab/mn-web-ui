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
  const seen = new Set<string>();
  const edges: WorkflowTopologyEdge[] = [];

  const addEdge = (edge: WorkflowTopologyEdge) => {
    if (!knownStepIds.has(edge.source) || !knownStepIds.has(edge.target) || edge.source === edge.target) return;
    // The monitor can provide both a labeled edge and the matching step
    // relationship. They describe one connection, so keep the explicit edge
    // (and its event label) rather than rendering a duplicate parallel line.
    const key = `${edge.source}\u0000${edge.target}`;
    if (seen.has(key)) return;
    seen.add(key);
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

  return { steps, edges };
};
