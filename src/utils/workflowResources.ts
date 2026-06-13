import type { JobDetails, WorkflowProgress } from '../api';
import { artifactDisplayName, isOpenableHref } from './artifacts';

export type ProgressResource = {
  id: string;
  label: string;
  value: string;
  href?: string;
  revealUrl?: string;
  kind: 'file' | 'url' | 'input' | 'text';
};

export type FailureArtifact = {
  artifact_id?: string;
  relative_path?: string;
  path?: string;
  url?: string;
  reveal_url?: string;
  size_bytes?: number;
};

const RESOURCE_KEYS = ['outputs', 'output', 'artifacts', 'artifact', 'files', 'urls', 'results', 'result'];
const INPUT_RESOURCE_KEYS = ['inputs', 'input', 'sources', 'source'];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const displayNameFromPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Untitled';
  try {
    const parsed = new URL(trimmed);
    return parsed.hostname || trimmed;
  } catch {
    const normalized = trimmed.replace(/\/+$/, '');
    return normalized.split('/').filter(Boolean).pop() || normalized;
  }
};

const isUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const stringProp = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const resourceFromPrimitive = (
  value: string | number | boolean,
  id: string,
  fallbackLabel?: string,
): ProgressResource | null => {
  const text = String(value).trim();
  if (!text) return null;
  return {
    id,
    label: fallbackLabel || displayNameFromPath(text),
    value: text,
    href: isOpenableHref(text) ? text : undefined,
    kind: isUrl(text) ? 'url' : text.includes('/') || text.includes('.') ? 'file' : 'text',
  };
};

const resourceFromRecord = (
  value: Record<string, unknown>,
  id: string,
  fallbackLabel?: string,
): ProgressResource | null => {
  const artifact = {
    artifact_id: stringProp(value, 'artifact_id'),
    relative_path: stringProp(value, 'relative_path'),
    path: stringProp(value, 'path'),
    url: stringProp(value, 'url'),
    reveal_url: stringProp(value, 'reveal_url'),
    label: stringProp(value, 'label'),
    title: stringProp(value, 'title'),
    name: stringProp(value, 'name'),
  };
  const rawValue = artifact.relative_path
    || artifact.path
    || value.file
    || value.file_path
    || value.local_path
    || value.value
    || artifact.url
    || value.href
    || artifact.name;
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') {
    return null;
  }
  const text = String(rawValue).trim();
  if (!text) return null;
  const hrefValue = stringProp(value, 'url') || stringProp(value, 'href');
  return {
    id,
    label: artifactDisplayName(artifact, fallbackLabel || displayNameFromPath(text)),
    value: text,
    href: isOpenableHref(hrefValue) ? hrefValue : isOpenableHref(text) ? text : undefined,
    revealUrl: artifact.reveal_url,
    kind: isUrl(hrefValue || text) ? 'url' : 'file',
  };
};

const resourceFromValue = (value: unknown, id: string, fallbackLabel?: string): ProgressResource | null => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return resourceFromPrimitive(value, id, fallbackLabel);
  }
  return isRecord(value) ? resourceFromRecord(value, id, fallbackLabel) : null;
};

const collectResources = (source: unknown, keys: string[], prefix: string): ProgressResource[] => {
  if (!isRecord(source)) return [];
  const resources: ProgressResource[] = [];
  keys.forEach((key) => {
    const raw = source[key];
    if (Array.isArray(raw)) {
      raw.forEach((item, index) => {
        const resource = resourceFromValue(item, `${prefix}-${key}-${index}`);
        if (resource) resources.push(resource);
      });
      return;
    }
    if (isRecord(raw)) {
      Object.entries(raw).forEach(([name, item], index) => {
        const resource = resourceFromValue(item, `${prefix}-${key}-${name}-${index}`, name);
        if (resource) resources.push(resource);
      });
      return;
    }
    const resource = resourceFromValue(raw, `${prefix}-${key}`, key);
    if (resource) resources.push(resource);
  });
  return resources;
};

const uniqueResources = (resources: ProgressResource[]) => {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key = `${resource.kind}:${resource.revealUrl || resource.href || resource.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const artifactsFromDetails = (details?: JobDetails | null) => {
  const root = details as Record<string, unknown> | null | undefined;
  const artifacts = root?.artifacts || root?.output_files || details?.job?.artifacts;
  return Array.isArray(artifacts) ? artifacts.filter(isRecord) as FailureArtifact[] : [];
};

export const buildOutputResources = (
  progress: WorkflowProgress,
  details?: JobDetails | null,
): ProgressResource[] => {
  const detailRoot = details as Record<string, unknown> | null | undefined;
  const job = isRecord(details?.job) ? details.job : {};
  const summary = isRecord(details?.summary) ? details.summary : {};
  const events = [...(progress.recent_events || []), ...(details?.recent_events || [])];
  return uniqueResources([
    ...collectResources(progress, RESOURCE_KEYS, 'progress'),
    ...progress.steps.flatMap((step, index) => collectResources(step, [...RESOURCE_KEYS, 'provides'], `step-${index}`)),
    ...collectResources(detailRoot, RESOURCE_KEYS, 'details'),
    ...collectResources(job, RESOURCE_KEYS, 'job'),
    ...collectResources(summary, RESOURCE_KEYS, 'summary'),
    ...events.flatMap((event, index) => collectResources(event.payload, RESOURCE_KEYS, `event-${index}`)),
  ]);
};

export const buildInputResources = (
  progress: WorkflowProgress,
  details?: JobDetails | null,
): ProgressResource[] => {
  const detailRoot = details as Record<string, unknown> | null | undefined;
  const job = isRecord(details?.job) ? details.job : {};
  const summary = isRecord(details?.summary) ? details.summary : {};
  return uniqueResources([
    ...collectResources(progress, INPUT_RESOURCE_KEYS, 'progress-input'),
    ...progress.steps.flatMap((step, index) => collectResources(step, [...INPUT_RESOURCE_KEYS, 'requires'], `step-input-${index}`)),
    ...collectResources(detailRoot, INPUT_RESOURCE_KEYS, 'details-input'),
    ...collectResources(job, INPUT_RESOURCE_KEYS, 'job-input'),
    ...collectResources(summary, [...INPUT_RESOURCE_KEYS, 'config'], 'summary-input'),
  ]).map((resource) => ({ ...resource, kind: resource.kind === 'url' ? resource.kind : 'input' }));
};
