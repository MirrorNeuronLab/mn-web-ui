import { z } from "zod";

export const CreateJobResponseSchema = z
  .object({ job_id: z.string().min(1) })
  .passthrough();

export const StableJobSchema = z
  .object({
    job_id: z.string(),
    type: z.string().nullable().optional(),
    blueprint_id: z.string().nullable().optional(),
    graph_id: z.string().nullable().optional(),
    job_name: z.string().nullable().optional(),
    owner_node: z.string().nullable().optional(),
    status: z.string().optional().default("active"),
    data_generation: z.number().optional().default(1),
    latest_run_id: z.string().nullable().optional(),
    run_count: z.number().optional().default(0),
    schedule_count: z.number().optional().default(0),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    resolved_configuration: z
      .record(z.string(), z.unknown())
      .optional()
      .default({}),
    schedules: z.array(z.unknown()).optional().default([]),
    schedule_ids: z.array(z.string()).optional().default([]),
    storage: z.record(z.string(), z.unknown()).optional().default({}),
    bundle_ref: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const JobUiDefinitionSchema = z
  .object({
    schema_version: z.string().optional().default("mn.web_ui.external.v1"),
    renderer: z.string().optional().default("external-url"),
    job_id: z.string().optional(),
    title: z.string().optional().default("Blueprint Web UI"),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough();

export const WebUiHandleSchema = z
  .object({
    adapter: z.string().optional().default("external-url"),
    kind: z.string().optional().default("service"),
    url: z.string().optional().default(""),
    title: z.string().optional().default("Blueprint Run"),
    status: z.string().optional().default("unknown"),
    path: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough();

const DefaultWebUiHandle = (() => {
  const parsed = WebUiHandleSchema.safeParse({});
  if (!parsed.success) throw new Error("WebUiHandleSchema default is invalid.");
  return parsed.data;
})();

export const JobUiResponseSchema = z
  .object({
    job_id: z.string(),
    ui: JobUiDefinitionSchema,
    web_ui: WebUiHandleSchema.optional().default(DefaultWebUiHandle),
  })
  .passthrough();

export const StableJobActionResponseSchema = z
  .object({
    job_id: z.string(),
    status: z.string().optional().default("active"),
    data_generation: z.number().optional(),
  })
  .passthrough();

export type StableJob = z.infer<typeof StableJobSchema>;

export type JobUiDefinition = z.infer<typeof JobUiDefinitionSchema>;

export type WebUiHandle = z.infer<typeof WebUiHandleSchema>;

export type JobUiResponse = z.infer<typeof JobUiResponseSchema>;

export type StableJobActionResponse = z.infer<
  typeof StableJobActionResponseSchema
>;
