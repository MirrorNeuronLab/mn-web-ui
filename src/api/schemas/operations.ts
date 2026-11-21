import { z } from "zod";

export const OperationCountersSchema = z
  .object({
    total: z.number().optional().default(0),
    started: z.number().optional().default(0),
    finished: z.number().optional().default(0),
    succeeded: z.number().optional().default(0),
    failed: z.number().optional().default(0),
    deferred: z.number().optional().default(0),
  })
  .passthrough();

export const OperationSchema = z
  .object({
    operation_id: z.string(),
    kind: z.string().optional().default("operation"),
    status: z.string().optional().default("running"),
    counters: OperationCountersSchema.optional().default({
      total: 0,
      started: 0,
      finished: 0,
      succeeded: 0,
      failed: 0,
      deferred: 0,
    }),
  })
  .passthrough();

export type Operation = z.infer<typeof OperationSchema>;
