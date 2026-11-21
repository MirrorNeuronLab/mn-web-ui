import { z } from "zod";

export const ErrorEnvelopeSchema = z
  .object({
    schema_version: z.string().optional().default("mn.error.v1"),
    code: z.string().optional().default("runtime.failure"),
    desc: z.string().optional().default("Runtime failure"),
    details: z.record(z.string(), z.unknown()).optional().default({}),
    severity: z.string().optional().default("ERROR"),
    occurred_at: z.string().optional(),
    event_id: z.string().optional(),
    trace_id: z.string().nullable().optional(),
    span_id: z.string().nullable().optional(),
    remediation: z.string().optional(),
    links: z
      .array(
        z
          .object({
            rel: z.string().optional(),
            artifact_id: z.string().optional(),
            url: z.string().optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export const ObservabilitySummarySchema = z
  .record(z.string(), z.unknown())
  .optional();

export const PageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item).optional().default([]),
    next_page_token: z.string().nullable().optional().default(null),
  });

export type Page<T> = { items: T[]; next_page_token: string | null };

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;
