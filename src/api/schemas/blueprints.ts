import { z } from "zod";

export const LaunchBodySchema = z.object({
  config_overrides: z.record(z.string(), z.unknown()),
});

export const BlueprintSchema = z
  .object({
    id: z.string(),
    version: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional().default(""),
    category: z.string().optional(),
    category_slug: z.string().optional(),
    path: z.string().optional(),
  })
  .passthrough();

export const BlueprintListResponseSchema = z
  .object({
    items: z.array(BlueprintSchema),
    next_page_token: z.string().nullable().optional().default(null),
  })
  .passthrough();

export const BlueprintLaunchResponseSchema = z
  .object({
    id: z.string().nullable().optional(),
    job_id: z.string().nullable().optional(),
    run_id: z.string().optional().nullable(),
    status: z.string().optional().default("pending"),
    source: z.string().optional(),
    blueprint: BlueprintSchema.optional(),
    validation: z.record(z.string(), z.unknown()).optional(),
    model_install: z.record(z.string(), z.unknown()).optional(),
    progress_id: z.string().optional().nullable(),
    progress_url: z.string().optional().nullable(),
    command: z.string().optional(),
  })
  .passthrough();

export const UploadedBundleSchema = z
  .object({
    bundle_id: z.string(),
  })
  .passthrough();

export type Blueprint = z.infer<typeof BlueprintSchema>;

export type BlueprintListResponse = z.infer<typeof BlueprintListResponseSchema>;

export type BlueprintLaunchResponse = z.infer<
  typeof BlueprintLaunchResponseSchema
>;

export type UploadedBundle = z.infer<typeof UploadedBundleSchema>;
