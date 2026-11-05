import api, { getApiBaseUrl, getAuthHeader } from "./client";
import {
  collectPages,
  parsePage,
  parseOrThrow,
  ValidationError,
} from "./parsing";
import {
  blueprintPath,
  jobPath,
  modelPath,
  operationPath,
  routeId,
  runPath,
} from "./routes";
import { createWorkflowProgressStreamer } from "./streaming";
import { isRecord } from "../utils/records";
import { waitForOperation } from "./operations";
import {
  WorkflowStepsSchema,
  WorkflowDagSchema,
  type WorkflowShape,
} from "./workflowShape";

import {
  JobEventSchema,
  StableJobSchema,
  StableRunSchema,
  RunSummarySchema,
  JobDetailsSchema,
  AgentGraphSchema,
  SystemSummarySchema,
  RuntimeModelSchema,
  RuntimeModelListResponseSchema,
  RuntimeModelBenchmarkSchema,
  ClusterNodeAddResponseSchema,
  JobUiResponseSchema,
  BlueprintSchema,
  BlueprintLaunchResponseSchema,
  UploadedBundleSchema,
  OperationSchema,
  StableJobActionResponseSchema,
  StableRunActionResponseSchema,
  LaunchProgressResponseSchema,
  WorkflowProgressSchema,
  CreateJobResponseSchema,
  AddClusterNodeRequestSchema,
  BenchmarkRequestSchema,
  LaunchBodySchema,
} from "./schemas";
import type {
  Job,
  RunSummary,
  JobDetails,
  RuntimeModelListResponse,
} from "./schemas";

// Preserve the established API import surface while schemas have a single owner.
export {
  ErrorEnvelopeSchema,
  ObservabilitySummarySchema,
  AgentSchema,
  JobEventSchema,
  JobSchema,
  StableJobSchema,
  StableRunSchema,
  RunSummarySchema,
  JobDetailsSchema,
  AgentGraphNodeSchema,
  AgentGraphEdgeSchema,
  AgentGraphSchema,
  SystemSummarySchema,
  RuntimeModelCompatibilitySchema,
  RuntimeModelSchema,
  RuntimeModelListResponseSchema,
  RuntimeModelBenchmarkSchema,
  ClusterNodeAddResponseSchema,
  JobUiDefinitionSchema,
  WebUiHandleSchema,
  JobUiResponseSchema,
  BlueprintSchema,
  BlueprintListResponseSchema,
  BlueprintLaunchResponseSchema,
  UploadedBundleSchema,
  PageSchema,
  OperationCountersSchema,
  OperationSchema,
  StableJobActionResponseSchema,
  StableRunActionResponseSchema,
  RevealArtifactResponseSchema,
  LaunchProgressEventSchema,
  LaunchProgressPhaseSchema,
  LaunchProgressResponseSchema,
  WorkflowActivitySchema,
  WorkflowProgressAgentSchema,
  WorkflowProgressStepSchema,
  WorkflowProgressSchema,
} from "./schemas";
export type {
  Page,
  Agent,
  ErrorEnvelope,
  ObservabilitySummary,
  JobEvent,
  Job,
  StableJob,
  StableRun,
  RunSummary,
  JobDetails,
  AgentGraph,
  SystemSummary,
  RuntimeModel,
  RuntimeModelListResponse,
  RuntimeModelBenchmark,
  ClusterNodeAddResponse,
  JobUiDefinition,
  WebUiHandle,
  JobUiResponse,
  Blueprint,
  BlueprintListResponse,
  BlueprintLaunchResponse,
  UploadedBundle,
  Operation,
  StableJobActionResponse,
  StableRunActionResponse,
  RevealArtifactResponse,
  LaunchProgressEvent,
  LaunchProgressPhase,
  LaunchProgressResponse,
  WorkflowActivity,
  WorkflowProgressAgent,
  WorkflowProgressStep,
  WorkflowProgress,
} from "./schemas";

export class MissingEtagError extends Error {
  constructor(action: string) {
    super(
      `Couldn't verify the job version before ${action}. Reload the job and try again.`,
    );
    this.name = "MissingEtagError";
  }
}

let idempotencyCounter = 0;
export const newIdempotencyKey = (): string => {
  try {
    const randomUUID = (globalThis.crypto as Crypto | undefined)?.randomUUID;
    if (typeof randomUUID === "function")
      return randomUUID.call(globalThis.crypto);
    const bytes = (
      globalThis.crypto as Crypto | undefined
    )?.getRandomValues?.bind(globalThis.crypto);
    if (bytes) {
      const buffer = new Uint8Array(16);
      bytes(buffer);
      const hex = [...buffer]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fall through to counter fallback
  }
  idempotencyCounter += 1;
  return `idempotency-${Date.now().toString(36)}-${idempotencyCounter}`;
};

const readEtag = (headers: unknown): string | null => {
  if (!headers || typeof headers !== "object") return null;
  const record = headers as Record<string, unknown> & {
    get?: (name: string) => string | null;
  };
  const viaGet = typeof record.get === "function" ? record.get("etag") : null;
  const candidates = [viaGet, record.etag, record.ETag, record.Etag];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return null;
};

// Preparation can include dependency/model downloads. Reads remain bounded at
// 30 seconds; explicit launches and uploads have a separate, longer deadline.
const PREPARATION_TIMEOUT_MS = 30 * 60_000;

export const isServiceJob = (
  job: Partial<Job | RunSummary> | null | undefined,
  summary?: {
    type?: unknown;
    job_type?: unknown;
    stream_mode?: unknown;
    policies?: unknown;
  },
): boolean => {
  const summaryType =
    typeof summary?.job_type === "string"
      ? summary.job_type
      : typeof summary?.type === "string"
        ? summary.type
        : "";
  const jobType = job?.job_type || job?.type || "";
  const summaryStreamMode =
    typeof summary?.stream_mode === "string" ? summary.stream_mode : "";
  const policies =
    summary?.policies &&
    typeof summary.policies === "object" &&
    !Array.isArray(summary.policies)
      ? (summary.policies as Record<string, unknown>)
      : {};
  const policyStreamMode =
    typeof policies.stream_mode === "string" ? policies.stream_mode : "";
  return (
    [summaryType, jobType].some((value) => value.toLowerCase() === "service") ||
    [summaryStreamMode, policyStreamMode].some(
      (value) => value.toLowerCase() === "live",
    )
  );
};

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

export type FetchRunsOptions = {
  includeTerminal?: boolean;
  pageSize?: number;
  pageToken?: string | null;
};

export const fetchRuns = async (options: FetchRunsOptions = {}) => {
  const request =
    typeof options.includeTerminal === "boolean"
      ? api.get("/runs", {
          params: {
            include_terminal: options.includeTerminal,
            page_size: options.pageSize,
            page_token: options.pageToken,
          },
        })
      : api.get("/runs", {
          params: {
            page_size: options.pageSize,
            page_token: options.pageToken,
          },
        });
  const r = await request;
  return parsePage(RunSummarySchema, r.data, "fetchRuns");
};

export type FetchStableJobsOptions = {
  includeArchived?: boolean;
  pageSize?: number;
  pageToken?: string | null;
};

export const fetchStableJobs = async (options: FetchStableJobsOptions = {}) => {
  const response = await api.get("/jobs", {
    params: {
      include_archived: options.includeArchived ?? false,
      page_size: options.pageSize,
      page_token: options.pageToken,
    },
  });
  return parsePage(StableJobSchema, response.data, "fetchStableJobs");
};

const stableJobEtags = new Map<string, string>();

export const fetchStableJob = (id: string) =>
  api.get(jobPath(id)).then((response) => {
    const etag = readEtag(response.headers);
    if (etag) stableJobEtags.set(id, etag);
    else stableJobEtags.delete(id);
    return parseOrThrow(
      StableJobSchema,
      response.data,
      `fetchStableJob(${id})`,
    );
  });

export const fetchStableJobRuns = (id: string, pageToken?: string | null) =>
  api
    .get(jobPath(id, "/runs"), {
      params: { page_token: pageToken },
    })
    .then((response) =>
      parsePage(StableRunSchema, response.data, `fetchStableJobRuns(${id})`),
    );

export const startStableJobRun = (
  id: string,
  inputs: Record<string, unknown> = {},
  replaceExistingRun = false,
  idempotencyKey = newIdempotencyKey(),
) => {
  const runId = replaceExistingRun ? `service-${idempotencyKey}` : undefined;
  return api
    .post(
      jobPath(id, "/runs"),
      {
        inputs,
        replace_existing_run: replaceExistingRun,
        ...(runId ? { run_id: runId } : {}),
      },
      {
        headers: { "Idempotency-Key": idempotencyKey },
        timeout: PREPARATION_TIMEOUT_MS,
      },
    )
    .then((response) =>
      parseOrThrow(
        StableRunActionResponseSchema,
        response.data,
        `startStableJobRun(${id})`,
      ),
    );
};

const withStableJobEtag = async <T>(
  id: string,
  actionName: string,
  action: (etag: string) => Promise<T>,
): Promise<T> => {
  let etag = stableJobEtags.get(id);
  if (!etag) {
    await fetchStableJob(id);
    etag = stableJobEtags.get(id);
  }
  if (!etag) throw new MissingEtagError(actionName);
  return action(etag);
};

export const archiveStableJob = (id: string) =>
  withStableJobEtag(id, "archiving", (etag) =>
    api
      .patch(
        jobPath(id),
        { status: "archived" },
        {
          headers: { "If-Match": etag },
        },
      )
      .then((response) => {
        const nextEtag = readEtag(response.headers);
        if (nextEtag) stableJobEtags.set(id, nextEtag);
        return parseOrThrow(
          StableJobActionResponseSchema,
          response.data,
          `archiveStableJob(${id})`,
        );
      }),
  );

export const resetStableJobData = (
  id: string,
  idempotencyKey = newIdempotencyKey(),
) =>
  api
    .post(
      jobPath(id, "/data-resets"),
      {},
      {
        headers: { "Idempotency-Key": idempotencyKey },
      },
    )
    .then((response) =>
      waitForOperation(
        parseOrThrow(
          OperationSchema,
          response.data,
          `resetStableJobData(${id})`,
        ),
        fetchOperation,
      ),
    );

export const deleteStableJob = (id: string) =>
  withStableJobEtag(id, "deleting", (etag) =>
    api
      .delete(jobPath(id), { headers: { "If-Match": etag } })
      .then((response) => {
        stableJobEtags.delete(id);
        return response.status === 204
          ? undefined
          : parseOrThrow(
              StableJobActionResponseSchema,
              response.data,
              `deleteStableJob(${id})`,
            );
      }),
  );

export const fetchStableRun = (id: string) =>
  api
    .get(runPath(id))
    .then((response) =>
      parseOrThrow(StableRunSchema, response.data, `fetchStableRun(${id})`),
    );

const runAction = (id: string, action: "pause" | "resume" | "cancel") =>
  api
    .patch(runPath(id), {
      desired_state:
        action === "resume"
          ? "running"
          : action === "cancel"
            ? "cancelled"
            : "paused",
    })
    .then((response) =>
      parseOrThrow(
        StableRunActionResponseSchema,
        response.data,
        `runAction(${id}, ${action})`,
      ),
    );

export const pauseRun = (id: string) => runAction(id, "pause");
export const resumeRun = (id: string) => runAction(id, "resume");
export const cancelRun = (id: string) => runAction(id, "cancel");

export const deleteRun = (id: string) =>
  api
    .delete(runPath(id))
    .then((response) =>
      response.status === 204
        ? undefined
        : parseOrThrow(
            StableRunActionResponseSchema,
            response.data,
            `deleteRun(${id})`,
          ),
    );

export const fetchJobDetails = async (id: string): Promise<JobDetails> => {
  const [response, run] = await Promise.all([
    api.get(runPath(id, "/monitor")),
    fetchStableRun(id),
  ]);
  const monitor = parseOrThrow(
    JobDetailsSchema,
    response.data,
    "fetchJobDetails",
  );
  let workflowShape: WorkflowShape | undefined;
  let workflowShapeWarning: string | undefined;
  if (run.job_id) {
    try {
      const [job, stepsResponse, dagResponse] = await Promise.all([
        fetchStableJob(run.job_id),
        api.get(jobPath(run.job_id, "/workflow/latest-run/steps")),
        api.get(jobPath(run.job_id, "/workflow/latest-run/dag")),
      ]);
      const steps = parseOrThrow(
        WorkflowStepsSchema,
        stepsResponse.data,
        "Workflow steps",
      );
      const dag = parseOrThrow(
        WorkflowDagSchema,
        dagResponse.data,
        "Workflow graph",
      );
      if (
        steps.run_id === id &&
        dag.run_id === id &&
        steps.job_id === run.job_id &&
        dag.job_id === run.job_id &&
        steps.graph_revision === dag.graph_revision
      ) {
        workflowShape = {
          ...steps,
          edges: dag.edges,
          layers: dag.layers,
          type: job.type,
          name: job.job_name,
        };
      } else {
        workflowShapeWarning =
          "Historical workflow labels are unavailable. Steps show runtime identifiers.";
      }
    } catch {
      workflowShapeWarning =
        "Workflow labels and topology could not be loaded. Reload to try again.";
    }
  }
  // The compact monitor's nested job_id is the execution, and its run_id may
  // identify output storage. Only the canonical Run owns the durable Job ID.
  return {
    ...monitor,
    job_id: run.job_id,
    execution_id: run.run_id,
    runtime_run_id: monitor.runtime_run_id || monitor.job.run_id,
    workflow_shape: workflowShape,
    workflow_shape_warning: workflowShapeWarning,
  };
};

export const fetchJobEvents = async (id: string) => {
  const page = await collectPages(
    (token) =>
      api
        .get(runPath(id, "/events"), {
          params: { page_token: token },
        })
        .then((r) => parsePage(JobEventSchema, r.data, "fetchJobEvents")),
    "Run events",
  );
  return page.items;
};
export const fetchJobAgentGraph = (id: string) =>
  api
    .get(runPath(id, "/agent-graph"))
    .then((r) =>
      parseOrThrow(AgentGraphSchema, r.data, `fetchJobAgentGraph(${id})`),
    );
export const fetchJobUi = (id: string) =>
  api
    .get(jobPath(id, "/ui"))
    .then((r) =>
      parseOrThrow(JobUiResponseSchema, r.data, `fetchJobUi(${id})`),
    );
export const fetchBlueprints = () =>
  collectPages(
    (token) =>
      api
        .get("/blueprints", {
          params: { page_token: token },
        })
        .then((r) => parsePage(BlueprintSchema, r.data, "fetchBlueprints")),
    "Blueprints",
  );
export const fetchWorkflowProgress = (id: string) =>
  api
    .get(runPath(id, "/workflow-progress"))
    .then((r) =>
      parseOrThrow(
        WorkflowProgressSchema,
        r.data,
        `fetchWorkflowProgress(${id})`,
      ),
    );
export const fetchLaunchProgress = (id: string) =>
  api
    .get(`/launch-progress/${routeId(id)}`)
    .then((r) =>
      parseOrThrow(
        LaunchProgressResponseSchema,
        r.data,
        `fetchLaunchProgress(${id})`,
      ),
    );

export const downloadRunFile = async (href: string) => {
  if (
    !/^\/api\/v1\/runs\/[^/]+\/(artifacts|outputs)\//.test(href) ||
    /[\\?#]/.test(href)
  ) {
    throw new Error("Invalid run file URL.");
  }
  const response = await api.get(href.slice("/api/v1".length), {
    responseType: "blob",
    timeout: PREPARATION_TIMEOUT_MS,
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = decodeURIComponent(href.split("/").at(-1) || "artifact");
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const workflowProgressStreamUrl = (id: string) =>
  `${getApiBaseUrl()}${runPath(id, "/events/stream")}`;

export const streamWorkflowProgress = createWorkflowProgressStreamer({
  schema: WorkflowProgressSchema,
  streamUrl: workflowProgressStreamUrl,
  authHeader: getAuthHeader,
  validationLabel: (id) => `streamWorkflowProgress(${id})`,
});
export const fetchOperation = (id: string) =>
  api
    .get(operationPath(id))
    .then((r) =>
      parseOrThrow(OperationSchema, r.data, `fetchOperation(${id})`),
    );
export const uploadBundle = (file: File) => {
  const formData = new FormData();
  formData.append("bundle", file);
  return api
    .post("/bundles", formData, { timeout: PREPARATION_TIMEOUT_MS })
    .then((r) => parseOrThrow(UploadedBundleSchema, r.data, "uploadBundle"));
};
export const createJob = (
  payload: unknown,
  idempotencyKey = newIdempotencyKey(),
  progressId?: string,
) =>
  api
    .post("/jobs", payload, {
      timeout: PREPARATION_TIMEOUT_MS,
      headers: {
        "Idempotency-Key": idempotencyKey,
        ...(progressId ? { "X-Launch-Progress-ID": progressId } : {}),
      },
    })
    .then((r) => parseOrThrow(CreateJobResponseSchema, r.data, "createJob"));

const parseLaunchResponse = (data: unknown) => {
  const result = BlueprintLaunchResponseSchema.safeParse(data);
  if (!result.success) {
    console.error("launchBlueprintJob returned invalid data.");
    throw new ValidationError(
      "launchBlueprintJob",
      "The server returned an invalid launch response. Try again.",
    );
  }
  return result.data;
};

export const launchBlueprintJob = (
  payload: unknown,
  options: { progressId?: string; idempotencyKey?: string } = {},
) => {
  const record = isRecord(payload) ? payload : {};
  if (record.source === "catalog") {
    const blueprintId =
      typeof record.blueprint_id === "string" ? record.blueprint_id.trim() : "";
    if (!blueprintId)
      return Promise.reject(
        new Error("Catalog blueprint launch requires a blueprint id."),
      );
  }

  if (record.source === "bundle") {
    const bundleId =
      typeof record.bundle_id === "string" ? record.bundle_id.trim() : "";
    if (!bundleId)
      return Promise.reject(new Error("Bundle launch requires a bundle id."));
    const launchKey = options.idempotencyKey || newIdempotencyKey();
    return createJob(
      {
        bundle_id: bundleId,
        ...(isRecord(record.config_overrides)
          ? { resolved_configuration: record.config_overrides }
          : {}),
      },
      launchKey,
      options.progressId,
    ).then((job) => {
      const jobId =
        isRecord(job) && typeof job.job_id === "string" ? job.job_id : "";
      if (!jobId) throw new Error("Job creation did not return a job id.");
      // Both stages retain their identity across a lost-response retry. Keys
      // are scoped by endpoint, so the same reviewed launch key is safe here.
      return startStableJobRun(jobId, {}, false, launchKey).then((run) =>
        parseLaunchResponse(run),
      );
    });
  }
  if (record.source !== "catalog")
    return Promise.reject(
      new Error("Host filesystem paths are not accepted by the REST API."),
    );

  const blueprintId =
    typeof record.blueprint_id === "string" ? record.blueprint_id.trim() : "";
  const body = LaunchBodySchema.parse({
    config_overrides: isRecord(record.config_overrides)
      ? record.config_overrides
      : {},
  });
  return api
    .post(blueprintPath(blueprintId, "/runs"), body, {
      timeout: PREPARATION_TIMEOUT_MS,
      headers: {
        "Idempotency-Key": options.idempotencyKey || newIdempotencyKey(),
        ...(options.progressId
          ? { "X-Launch-Progress-ID": options.progressId }
          : {}),
      },
    })
    .then((r) => parseLaunchResponse(r.data));
};
