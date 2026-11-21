import { normalizeWorkflowProgressPayload } from "../workflowProgress";
import { ErrorEnvelopeSchema, ObservabilitySummarySchema } from "./common";
import { JobEventSchema } from "./runs";
import { z } from "zod";

export const LaunchProgressEventSchema = z
  .object({
    ts: z.string().optional(),
    phase: z.string().optional().default("launch"),
    status: z.string().optional().default("pending"),
    message: z.string().optional().default(""),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const LaunchProgressPhaseSchema = z
  .object({
    id: z.string().optional(),
    phase: z.string().optional(),
    label: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional().default("pending"),
    message: z.string().optional().default(""),
    detail: z.string().optional(),
    expectation: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    severity: z.string().optional(),
  })
  .passthrough();

export const LaunchProgressResponseSchema = z
  .object({
    progress_id: z.string(),
    run_id: z.string().nullable().optional(),
    job_id: z.string().nullable().optional(),
    status: z.string().optional().default("pending"),
    current_phase: z.string().nullable().optional(),
    events: z.array(LaunchProgressEventSchema).optional().default([]),
    phases: z.array(LaunchProgressPhaseSchema).optional().default([]),
    latest: LaunchProgressEventSchema.nullable().optional(),
    completed: z.boolean().optional().default(false),
    error: z.unknown().optional(),
  })
  .passthrough();

export const WorkflowActivitySchema = z
  .object({
    schema: z.string().optional(),
    event_id: z.string().optional(),
    level: z.enum(["debug", "info", "warning", "error"]).optional(),
    owner_blueprint: z.string().optional(),
    activity_kind: z
      .enum(["action", "result", "finding", "milestone", "diagnostic"])
      .optional(),
    timestamp: z.string().optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    step_id: z.string().optional(),
    agent_id: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    tool_name: z.string().optional(),
    target: z.string().optional(),
    duration_ms: z.number().optional(),
    result_summary: z.string().optional(),
    details: z.unknown().optional(),
    payload: z.unknown().optional(),
    failure: ErrorEnvelopeSchema.optional(),
  })
  .passthrough();

export const WorkflowProgressAgentSchema = z
  .object({
    id: z.string().optional().default("unknown"),
    alias: z.string().optional(),
    display_name: z.string().optional(),
    role: z.string().optional().default("worker"),
    working_on: z.string().optional().default("worker"),
    model: z.string().optional().default("runtime"),
    assigned_node: z.string().optional(),
    status: z.string().optional().default("pending"),
    progress: z.number().optional().default(0),
    progress_source: z.string().optional(),
    items_done: z.number().nullable().optional(),
    items_total: z.number().nullable().optional(),
    live: z.boolean().optional().default(false),
    mailbox_depth: z.number().nullable().optional(),
    tokens_used: z.number().nullable().optional(),
    token_budget: z.number().nullable().optional(),
    tools: z.number().nullable().optional(),
    elapsed_seconds: z.number().optional().default(0),
    started_at: z.string().nullable().optional(),
    ended_at: z.string().nullable().optional(),
    last_event_at: z.string().nullable().optional(),
    retry_at: z.string().nullable().optional(),
    deadline_at: z.string().nullable().optional(),
    heartbeat_deadline_at: z.string().nullable().optional(),
    attempt: z.number().nullable().optional(),
    attempt_id: z.string().nullable().optional(),
    status_reason: z.string().nullable().optional(),
    failure: ErrorEnvelopeSchema.nullable().optional(),
    activity_summary: z.string().optional(),
    last_activity: WorkflowActivitySchema.nullable().optional(),
    recent_events: z.array(WorkflowActivitySchema).optional(),
  })
  .passthrough();

export const WorkflowProgressStepSchema = z
  .object({
    id: z.string().optional().default("step"),
    label: z.string().optional().default("Step"),
    goal: z.string().optional().default(""),
    status: z.string().optional().default("pending"),
    current: z.boolean().optional().default(false),
    parents: z.array(z.string()).optional(),
    children: z.array(z.string()).optional(),
    layer: z.number().optional(),
    requires: z.array(z.string()).optional(),
    provides: z.array(z.string()).optional(),
    done_count: z.number().optional().default(0),
    running_count: z.number().optional().default(0),
    idle_count: z.number().optional().default(0),
    ready_count: z.number().optional().default(0),
    failed_count: z.number().optional().default(0),
    total_count: z.number().optional().default(0),
    live: z.boolean().optional().default(false),
    elapsed_seconds: z.number().optional().default(0),
    started_at: z.string().nullable().optional(),
    ended_at: z.string().nullable().optional(),
    last_event_at: z.string().nullable().optional(),
    retry_at: z.string().nullable().optional(),
    deadline_at: z.string().nullable().optional(),
    heartbeat_deadline_at: z.string().nullable().optional(),
    attempt: z.number().nullable().optional(),
    attempt_id: z.string().nullable().optional(),
    status_reason: z.string().nullable().optional(),
    failure: ErrorEnvelopeSchema.nullable().optional(),
    progress_source: z.string().optional(),
    activity_summary: z.string().optional(),
    last_activity: WorkflowActivitySchema.nullable().optional(),
    recent_events: z.array(WorkflowActivitySchema).optional(),
    agents: z.array(WorkflowProgressAgentSchema).optional().default([]),
  })
  .passthrough();

const WorkflowProgressObjectSchema = z
  .object({
    schema_version: z.union([z.number(), z.string()]).optional().default(1),
    job_id: z.string().optional().default("unknown"),
    workflow_id: z.string().optional().default("blueprint"),
    name: z.string().optional().default("Blueprint"),
    description: z.string().optional().default(""),
    status: z.string().optional().default("unknown"),
    trace_id: z.string().nullable().optional(),
    sequence: z.number().optional(),
    graph_revision: z.number().optional(),
    workflow_kind: z.enum(["batch", "service"]).optional().default("batch"),
    progress_source: z.string().optional(),
    failure: ErrorEnvelopeSchema.nullable().optional(),
    observability_summary: ObservabilitySummarySchema,
    generated_at: z.string().nullable().optional(),
    submitted_at: z.string().nullable().optional(),
    elapsed_seconds: z.number().optional().default(0),
    agent_count: z
      .object({
        done: z.number().optional().default(0),
        running: z.number().optional().default(0),
        idle: z.number().optional().default(0),
        ready: z.number().optional().default(0),
        failed: z.number().optional().default(0),
        total: z.number().optional().default(0),
      })
      .optional()
      .default({ done: 0, running: 0, idle: 0, ready: 0, failed: 0, total: 0 }),
    current_step_id: z.string().nullable().optional(),
    current_step_ids: z.array(z.string()).optional(),
    current_step: WorkflowProgressStepSchema.nullable().optional(),
    steps: z.array(WorkflowProgressStepSchema).optional().default([]),
    edges: z
      .array(
        z
          .object({
            from: z.string(),
            to: z.string(),
            event: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    layers: z.array(z.array(z.string())).optional(),
    messages: z.array(z.string()).optional().default([]),
    recent_events: z.array(JobEventSchema).optional().default([]),
  })
  .passthrough();

export const WorkflowProgressSchema = z.preprocess(
  normalizeWorkflowProgressPayload,
  WorkflowProgressObjectSchema,
);

export type LaunchProgressEvent = z.infer<typeof LaunchProgressEventSchema>;

export type LaunchProgressPhase = z.infer<typeof LaunchProgressPhaseSchema>;

export type LaunchProgressResponse = z.infer<
  typeof LaunchProgressResponseSchema
>;

export type WorkflowActivity = z.infer<typeof WorkflowActivitySchema>;

export type WorkflowProgressAgent = z.infer<typeof WorkflowProgressAgentSchema>;

export type WorkflowProgressStep = z.infer<typeof WorkflowProgressStepSchema>;

export type WorkflowProgress = z.infer<typeof WorkflowProgressSchema>;
