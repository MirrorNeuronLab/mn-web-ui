import { z } from 'zod';
import type { WorkflowProgress } from './index';

const identity = {
  job_id: z.string(),
  run_id: z.string().nullable(),
  source: z.enum(['definition', 'latest_run']),
  workflow_id: z.string(),
  graph_revision: z.number().nullable(),
};
export const WorkflowStepsSchema = z.object({
  ...identity,
  steps: z.array(z.object({
    id: z.string(), label: z.string(), goal: z.string(),
    agents: z.array(z.object({ id: z.string(), display_name: z.string(), role: z.string(), model: z.string() })),
  })),
});
export const WorkflowDagSchema = z.object({
  ...identity,
  nodes: z.array(z.object({ id: z.string(), label: z.string() })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), event: z.string().optional() }).passthrough()),
  layers: z.array(z.array(z.string())),
});
export type WorkflowShape = z.infer<typeof WorkflowStepsSchema> & {
  edges: z.infer<typeof WorkflowDagSchema>['edges'];
  layers: string[][];
  type?: string | null;
  name?: string | null;
};

/** v1 separates immutable labels/topology from mutable progress snapshots. */
export const applyWorkflowShape = (progress: WorkflowProgress, shape?: WorkflowShape): WorkflowProgress => {
  if (!shape) return progress;
  const definitions = new Map(shape.steps.map(step => [step.id, step]));
  if (progress.steps.some(step => !definitions.has(step.id))) return progress;
  const steps = progress.steps.map(step => {
    const definition = definitions.get(step.id)!;
    const agents = new Map(definition.agents.map(agent => [agent.id, agent]));
    return {
      ...step,
      label: definition.label,
      goal: definition.goal,
      agents: step.agents.map(agent => {
        const identity = agents.get(agent.id);
        return identity ? { ...agent, display_name: identity.display_name || agent.display_name, role: identity.role || agent.role, working_on: identity.role || agent.working_on, model: identity.model || agent.model } : agent;
      }),
    };
  });
  return {
    ...progress,
    workflow_id: shape.workflow_id,
    name: shape.name || shape.workflow_id,
    workflow_kind: shape.type === 'service' ? 'service' : progress.workflow_kind,
    graph_revision: shape.graph_revision ?? progress.graph_revision,
    steps,
    current_step: steps.find(step => step.id === progress.current_step_id) || null,
    edges: shape.edges,
    layers: shape.layers,
  };
};
