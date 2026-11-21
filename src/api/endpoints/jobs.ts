import api from "../client";
import { fetchOperation, waitForOperation } from "../operations";
import { parseOrThrow, parsePage } from "../parsing";
import { newIdempotencyKey, PREPARATION_TIMEOUT_MS } from "../requests";
import { jobPath } from "../routes";
import {
  CreateJobResponseSchema,
  JobUiResponseSchema,
  StableJobActionResponseSchema,
  StableJobSchema,
} from "../schemas/jobs";
import { OperationSchema } from "../schemas/operations";
import {
  type Job,
  type RunSummary,
  StableRunActionResponseSchema,
  StableRunSchema,
} from "../schemas/runs";

export class MissingEtagError extends Error {
  constructor(action: string) {
    super(
      `Couldn't verify the job version before ${action}. Reload the job and try again.`,
    );
    this.name = "MissingEtagError";
  }
}

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

export const fetchJobUi = (id: string) =>
  api
    .get(jobPath(id, "/ui"))
    .then((r) =>
      parseOrThrow(JobUiResponseSchema, r.data, `fetchJobUi(${id})`),
    );

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
