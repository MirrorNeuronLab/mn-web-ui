import { ErrorEnvelopeSchema, ObservabilitySummarySchema } from "./common";
import { z } from "zod";

export const AgentSchema = z
  .object({
    agent_id: z.string().optional().default("unknown"),
    alias: z.string().optional(),
    display_name: z.string().optional(),
    label: z.string().optional(),
    role: z.string().optional(),
    agent_type: z.string().optional().default("unknown"),
    type: z.string().optional().default("unknown"),
    assigned_node: z.string().optional().default("unassigned"),
    status: z.string().optional().default("unknown"),
    running: z.boolean().optional(),
    processed_messages: z.number().optional().default(0),
    mailbox_depth: z.number().optional().default(0),
    paused: z.boolean().optional(),
    failure: ErrorEnvelopeSchema.optional().nullable(),
    metadata: z
      .object({
        outbound_edges: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough();

export const JobEventSchema = z
  .object({
    timestamp: z.string().optional().default("unknown"),
    type: z.string().optional().default("unknown"),
    agent_id: z.string().optional(),
    payload: z.any().optional(),
    error: ErrorEnvelopeSchema.optional(),
    failure: ErrorEnvelopeSchema.nullable().optional(),
  })
  .passthrough();

export const JobSchema = z
  .object({
    job_id: z.string().optional().default("unknown"),
    graph_id: z.string().nullable().optional().default("unknown"),
    status: z.string().optional().default("unknown"),
    submitted_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    run_id: z.string().nullable().optional(),
    trace_id: z.string().nullable().optional(),
    executor_count: z.number().optional(),
    active_executors: z.number().optional(),
    type: z.string().nullable().optional(),
    job_type: z.string().nullable().optional(),
    live: z.boolean().optional(),
    "live?": z.boolean().optional(),
    recovery_status: z.string().nullable().optional(),
    recovery_requires_review: z.boolean().optional(),
    recovery: z.record(z.string(), z.unknown()).optional(),
    failure: ErrorEnvelopeSchema.nullable().optional(),
  })
  .passthrough();

export const StableRunSchema = z
  .object({
    run_id: z.string(),
    job_id: z.string().nullable().optional(),
    graph_id: z.string().nullable().optional(),
    job_name: z.string().nullable().optional(),
    workflow_id: z.string().nullable().optional(),
    status: z.string().optional().default("unknown"),
    type: z.string().nullable().optional(),
    job_type: z.string().nullable().optional(),
    attempt: z.number().optional().default(1),
    attempt_id: z.string().nullable().optional(),
    data_generation: z.number().optional(),
    job_data_access: z.string().nullable().optional(),
    owner_node: z.string().nullable().optional(),
    submitted_at: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    cancelled_at: z.string().nullable().optional(),
  })
  .passthrough();

export const RunSummarySchema = StableRunSchema.extend({
  executor_count: z.number().optional(),
  active_executors: z.number().optional(),
  live: z.boolean().optional(),
  "live?": z.boolean().optional(),
  recovery_status: z.string().nullable().optional(),
  recovery_requires_review: z.boolean().optional(),
  recovery: z.record(z.string(), z.unknown()).optional(),
  failure: ErrorEnvelopeSchema.nullable().optional(),
}).passthrough();

export const JobDetailsSchema = z
  .object({
    job: JobSchema,
    job_id: z.string().nullable().optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    agents: z.array(AgentSchema).optional().default([]),
    sandboxes: z.array(z.unknown()).optional().default([]),
    recent_events: z.array(JobEventSchema).optional().default([]),
    web_ui: z.record(z.string(), z.unknown()).optional(),
    web_ui_service: z.record(z.string(), z.unknown()).optional(),
    blueprint_web_ui_service: z.record(z.string(), z.unknown()).optional(),
    trace_id: z.string().nullable().optional(),
    execution_id: z.string().nullable().optional(),
    runtime_run_id: z.string().nullable().optional(),
    observability_summary: ObservabilitySummarySchema,
    failure: ErrorEnvelopeSchema.optional().nullable(),
  })
  .passthrough();

export const AgentGraphNodeSchema = z
  .object({
    id: z.string(),
    alias: z.string().optional(),
    display_name: z.string().optional(),
    label: z.string().optional(),
    role: z.string().optional(),
    agent_type: z.string().optional().default("unknown"),
    type: z.string().optional().default("unknown"),
    assigned_node: z.string().optional().default("unassigned"),
    status: z.string().optional().default("unknown"),
    processed_messages: z.number().optional().default(0),
    mailbox_depth: z.number().optional().default(0),
  })
  .passthrough();

export const AgentGraphEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    message_type: z.string().optional().default("message"),
    count: z.number().optional().default(0),
    last_seen_at: z.string().nullable().optional(),
    source_event: z.string().optional(),
  })
  .passthrough();

export const AgentGraphSchema = z
  .object({
    job_id: z.string(),
    graph_id: z.string().nullable().optional(),
    status: z.string().optional().default("unknown"),
    nodes: z.array(AgentGraphNodeSchema).optional().default([]),
    edges: z.array(AgentGraphEdgeSchema).optional().default([]),
    stats: z
      .object({
        agent_count: z.number().optional().default(0),
        edge_count: z.number().optional().default(0),
        message_count: z.number().optional().default(0),
        event_count: z.number().optional().default(0),
      })
      .optional()
      .default({
        agent_count: 0,
        edge_count: 0,
        message_count: 0,
        event_count: 0,
      }),
  })
  .passthrough();

export const StableRunActionResponseSchema = z
  .object({
    run_id: z.string(),
    job_id: z.string().nullable().optional(),
    status: z.string().optional().default("unknown"),
    replaced_run_ids: z.array(z.string()).optional(),
    cleanup_deferred: z.boolean().optional(),
    cleanup_pending_nodes: z.array(z.string()).optional(),
  })
  .passthrough();

export const RevealArtifactResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    path: z.string().optional(),
    folder: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type Agent = z.infer<typeof AgentSchema>;

export type JobEvent = z.infer<typeof JobEventSchema>;

export type Job = z.infer<typeof JobSchema>;

export type StableRun = z.infer<typeof StableRunSchema>;

export type RunSummary = z.infer<typeof RunSummarySchema>;

export type JobDetails = z.infer<typeof JobDetailsSchema>;

export type AgentGraph = z.infer<typeof AgentGraphSchema>;

export type StableRunActionResponse = z.infer<
  typeof StableRunActionResponseSchema
>;

export type RevealArtifactResponse = z.infer<
  typeof RevealArtifactResponseSchema
>;
