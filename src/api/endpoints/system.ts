import api from "../client";
import { collectPages, parseOrThrow, parsePage } from "../parsing";
import { modelPath } from "../routes";
import {
  AddClusterNodeRequestSchema,
  BenchmarkRequestSchema,
  ClusterNodeAddResponseSchema,
  RuntimeModelBenchmarkSchema,
  type RuntimeModelListResponse,
  RuntimeModelListResponseSchema,
  RuntimeModelSchema,
  SystemSummarySchema,
} from "../schemas/system";

export const fetchSystemSummary = () =>
  api
    .get("/system/summary")
    .then((r) => parseOrThrow(SystemSummarySchema, r.data, "SystemSummary"));

export const fetchRuntimeModels =
  async (): Promise<RuntimeModelListResponse> => {
    const page = await collectPages(
      (token) =>
        api
          .get("/models", {
            params: { installed_only: true, page_token: token },
          })
          .then((r) =>
            parsePage(RuntimeModelSchema, r.data, "fetchRuntimeModels"),
          ),
      "Models",
    );
    return RuntimeModelListResponseSchema.parse(page);
  };

export const benchmarkRuntimeModel = (
  model: string,
  payload: { prompt?: string; max_tokens?: number } = {},
) =>
  api
    .post(
      modelPath(model, "/benchmarks"),
      BenchmarkRequestSchema.parse(payload),
      { timeout: 70_000 },
    )
    .then((r) =>
      parseOrThrow(
        RuntimeModelBenchmarkSchema,
        r.data,
        `benchmarkRuntimeModel(${model})`,
      ),
    );

export const addClusterNode = (payload: { host: string; token: string }) =>
  api
    .post("/nodes", AddClusterNodeRequestSchema.parse(payload))
    .then((r) =>
      parseOrThrow(ClusterNodeAddResponseSchema, r.data, "addClusterNode"),
    );
