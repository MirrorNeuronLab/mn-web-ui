import type { JobDetails } from '../api';
import { isRecord } from './records';

export type WebUiInfo = {
  url: string;
  title: string;
  status?: string;
};

const stringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
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
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
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
    title: stringValue(record.title, nested?.title, metadata?.title) || 'Blueprint Web UI',
    status: stringValue(record.status, nested?.status, metadata?.status),
  };
};

export const blueprintWebUiInfo = (details: JobDetails): WebUiInfo | null => {
  const root = details as Record<string, unknown>;
  const job: Record<string, unknown> = isRecord(details.job) ? details.job : {};
  const summary: Record<string, unknown> = isRecord(details.summary) ? details.summary : {};
  const metadata: Record<string, unknown> = isRecord(job.metadata) ? job.metadata : {};
  const manifestMetadata: Record<string, unknown> = isRecord(job.manifest_metadata) ? job.manifest_metadata : {};
  const candidates = [
    root.web_ui,
    root.webUi,
    root.webUI,
    root.web_ui_service,
    root.blueprint_web_ui_service,
    job.web_ui,
    job.webUi,
    job.webUI,
    job.web_ui_service,
    job.blueprint_web_ui_service,
    summary.web_ui,
    summary.webUi,
    summary.webUI,
    summary.web_ui_service,
    summary.blueprint_web_ui_service,
    metadata.web_ui,
    metadata.webUi,
    metadata.webUI,
    metadata.web_ui_service,
    metadata.blueprint_web_ui_service,
    manifestMetadata.web_ui,
    manifestMetadata.webUi,
    manifestMetadata.webUI,
    manifestMetadata.web_ui_service,
    manifestMetadata.blueprint_web_ui_service,
  ];
  for (const candidate of candidates) {
    const info = webUiInfoFromRecord(candidate);
    if (info) return info;
  }
  return null;
};
