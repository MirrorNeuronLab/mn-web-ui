import api from "../client";
import { collectPages, parseOrThrow, parsePage } from "../parsing";
import { PREPARATION_TIMEOUT_MS } from "../requests";
import { jobPath, runPath } from "../routes";
import {
  AgentGraphSchema,
  type JobDetails,
  JobDetailsSchema,
  JobEventSchema,
  RunSummarySchema,
  StableRunActionResponseSchema,
  StableRunSchema,
} from "../schemas/runs";
import {
  WorkflowDagSchema,
  type WorkflowShape,
  WorkflowStepsSchema,
} from "../workflowShape";
import { fetchStableJob } from "./jobs";

export type FetchRunsOptions = {
  includeTerminal?: boolean;
  pageSize?: number;
  pageToken?: string | null;
};

export const fetchRuns = async (options: FetchRunsOptions = {}) => {
  const r = await api.get("/runs", {
    params: {
      ...(typeof options.includeTerminal === "boolean" && {
        include_terminal: options.includeTerminal,
      }),
      page_size: options.pageSize,
      page_token: options.pageToken,
    },
  });
  return parsePage(RunSummarySchema, r.data, "fetchRuns");
};

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
