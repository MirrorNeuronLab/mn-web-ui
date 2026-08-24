import { isRecord } from './records';

export type WebUiInfo = {
  url: string;
  title: string;
  status?: string;
  href?: string;
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
