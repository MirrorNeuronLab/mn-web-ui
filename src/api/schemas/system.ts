import { z } from "zod";

export const AddClusterNodeRequestSchema = z.object({
  host: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

export const BenchmarkRequestSchema = z
  .object({ prompt: z.string().optional(), max_tokens: z.number().optional() })
  .passthrough();

export const SystemSummarySchema = z
  .object({
    nodes: z.array(
      z
        .object({
          name: z.string().optional().default("unknown"),
          connected_nodes: z.array(z.string()).optional().default([]),
          self: z.boolean().optional(),
          "self?": z.boolean().optional(),
          executor_pools: z
            .record(
              z.string(),
              z.object({
                capacity: z.number().optional().default(0),
                available: z.number().optional().default(0),
                in_use: z.number().optional().default(0),
                queued: z.number().optional().default(0),
                active: z.number().optional().default(0),
              }),
            )
            .optional()
            .default({}),
        })
        .passthrough()
        .transform((node) => {
          if (node["self?"] !== undefined) node.self = node["self?"];
          return node;
        }),
    ),
    jobs: z.array(
      z
        .object({
          job_id: z.string().optional().default("unknown"),
          status: z.string().optional().default("unknown"),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const RuntimeModelCompatibilitySchema = z
  .object({
    status: z.string().optional().default("unknown"),
    ok: z.boolean().optional().default(false),
    message: z.string().optional().default(""),
    warnings: z.array(z.string()).optional().default([]),
  })
  .passthrough()
  .nullable();

export const RuntimeModelSchema = z
  .object({
    id: z.string().optional().default("unknown"),
    name: z.string().optional().default("Runtime model"),
    provider: z.string().optional().default("docker_model_runner"),
    model: z.string().optional().default("unknown"),
    docker_model: z.string().optional().default("unknown"),
    api_model: z.string().optional(),
    backend: z.string().optional().default("unknown"),
    installed: z.boolean().optional().default(true),
    node: z.string().optional().default("local"),
    nodes: z.array(z.string()).optional().default([]),
    used_by: z.array(z.string()).optional().default([]),
    owner_count: z.number().optional().default(0),
    orphaned: z.boolean().optional().default(false),
    manual: z.boolean().optional().default(false),
    compatibility: RuntimeModelCompatibilitySchema.optional().default(null),
  })
  .passthrough();

export const RuntimeModelListResponseSchema = z
  .object({
    items: z.array(RuntimeModelSchema),
    next_page_token: z.string().nullable().optional().default(null),
    node: z.string().optional().default("local"),
    runner_available: z.boolean().optional().default(false),
    warnings: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export const RuntimeModelBenchmarkSchema = z
  .object({
    model: z.string().min(1),
    name: z.string().optional().default("Runtime model"),
    docker_model: z.string().optional().default("unknown"),
    api_model: z.string().optional(),
    node: z.string().optional().default("local"),
    elapsed_ms: z.number().nonnegative(),
    first_token_ms: z.number().nullable().optional(),
    generated_tokens: z.number().optional().default(0),
    tokens_per_second: z.number().nonnegative(),
    sample: z.string().optional().default(""),
    estimated: z.boolean().optional().default(true),
  })
  .passthrough();

export const ClusterNodeAddResponseSchema = z
  .object({
    ok: z.boolean().optional().default(true),
    host: z.string().optional().default(""),
    node_name: z.string().optional().default(""),
    status: z.string().optional().default("unknown"),
    message: z.string().optional().default(""),
  })
  .passthrough();

export type SystemSummary = z.infer<typeof SystemSummarySchema>;

export type RuntimeModel = z.infer<typeof RuntimeModelSchema>;

export type RuntimeModelListResponse = z.infer<
  typeof RuntimeModelListResponseSchema
>;

export type RuntimeModelBenchmark = z.infer<typeof RuntimeModelBenchmarkSchema>;

export type ClusterNodeAddResponse = z.infer<
  typeof ClusterNodeAddResponseSchema
>;
