import { format } from "date-fns";
import type {
  JobDetails as JobDetailsType,
  WorkflowProgress,
} from "../api/schemas";
import { isTerminalRunStatus } from "./jobStatus";
import { isRecord } from "./records";

export type WebUiInfo = {
  url: string;
  title: string;
  status?: string;
  href?: string;
};

export const stringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const safeWebUiUrl = (...values: unknown[]): string | undefined => {
  const raw = stringValue(...values);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

export const webUiInfoFromRecord = (record: unknown): WebUiInfo | null => {
  if (!isRecord(record)) return null;
  const nested = isRecord(record.web_ui) ? record.web_ui : undefined;
  const metadata = isRecord(record.metadata) ? record.metadata : undefined;
  const url = safeWebUiUrl(
    record.url,
    record.web_ui_url,
    record.webUiUrl,
    record.local_url,
    nested?.url,
    metadata?.url,
    metadata?.web_ui_url,
  );
  if (!url) return null;
  return {
    url,
    title:
      stringValue(record.title, nested?.title, metadata?.title) ||
      "Blueprint Web UI",
    status: stringValue(record.status, nested?.status, metadata?.status),
  };
};

export const observabilitySummaryFrom = (
  details: JobDetailsType,
  progress: WorkflowProgress | null,
  summaryRecord: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const root = details as Record<string, unknown>;
  const candidates = [
    progress?.observability_summary,
    root.observability_summary,
    summaryRecord.observability_summary,
    details.job?.observability_summary,
  ];
  return candidates.find(isNonEmptyRecord);
};

export const traceIdFrom = (
  details: JobDetailsType,
  progress: WorkflowProgress | null,
  summaryRecord: Record<string, unknown>,
  observabilitySummary?: Record<string, unknown>,
): string | undefined =>
  knownStringValue(
    progress?.trace_id,
    details.trace_id,
    details.job?.trace_id,
    summaryRecord.trace_id,
    observabilitySummary?.trace_id,
  );

export const isNonEmptyRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  isRecord(value) && Object.keys(value).length > 0;

export const responseStatusFromError = (error: unknown): number | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) return undefined;
  return typeof error.response.status === "number"
    ? error.response.status
    : undefined;
};

export const knownStringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== "unknown") return trimmed;
  }
  return undefined;
};

export const normalizedStatus = (...values: unknown[]): string | undefined => {
  const value = knownStringValue(...values);
  return value ? value.toLowerCase() : undefined;
};

export const canonicalActionStatus = (
  response: unknown,
  fallback: string,
): string => {
  const rawStatus = isRecord(response) ? response.status : undefined;
  const status = normalizedStatus(rawStatus, fallback) || fallback;
  if (status === "resumed") return "running";
  if (status === "canceled") return "cancelled";
  return status;
};

export const displayStatusFromSources = (
  actionStatus: string | null,
  progressStatus: unknown,
  jobStatus: unknown,
  graphStatus: unknown,
): string | undefined => {
  const progress = normalizedStatus(progressStatus);
  if (progress && isTerminalRunStatus(progress)) return progress;
  const action = normalizedStatus(actionStatus);
  if (action) return action;
  const job = normalizedStatus(jobStatus);
  if (job === "paused") return job;
  return normalizedStatus(progress, job, graphStatus);
};

export const inferredTerminalStatusFromProgress = (
  progress: WorkflowProgress | null | undefined,
): string | undefined => {
  if (!progress) return undefined;
  const status = normalizedStatus(progress.status);
  if (status && isTerminalRunStatus(status)) return status;

  const total = progress.agent_count?.total || 0;
  const done = progress.agent_count?.done || 0;
  const failed = progress.agent_count?.failed || 0;
  const running = progress.agent_count?.running || 0;
  if (!total || running > 0) return undefined;
  if (failed > 0 && done + failed >= total) return "failed";
  const source = normalizedStatus(progress.progress_source);
  if (
    progress.workflow_kind !== "service" &&
    done >= total &&
    source === "complete"
  )
    return "completed";
  return undefined;
};

export const formattedTimestamp = (
  ...values: unknown[]
): string | undefined => {
  const raw = knownStringValue(...values);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return format(parsed, "PP p");
};
