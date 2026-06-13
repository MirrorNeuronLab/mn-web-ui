import { AlertTriangle, ExternalLink, FileText } from 'lucide-react';
import type { ErrorEnvelope } from '../api';
import { artifactDisplayName } from '../utils/artifacts';
import { openArtifactLocation } from '../utils/artifactReveal';

type ArtifactRef = {
  artifact_id?: string;
  relative_path?: string;
  path?: string;
  url?: string;
  reveal_url?: string;
  size_bytes?: number;
};

type FailurePanelProps = {
  failure?: ErrorEnvelope | null;
  title?: string;
  compact?: boolean;
  artifacts?: ArtifactRef[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value) && value.truncated) {
    const preview = typeof value.preview === 'string' ? value.preview : '';
    const chars = typeof value.chars === 'number' ? ` (${value.chars} chars)` : '';
    return `${preview}${preview ? ' ' : ''}[truncated${chars}]`;
  }
  return '';
};

const formatBytes = (value?: number) => {
  if (!value || !Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
};

const detailValue = (failure: ErrorEnvelope | null | undefined, key: string) => {
  const details = isRecord(failure?.details) ? failure?.details : {};
  return text(details?.[key]);
};

const artifactForLink = (artifactId: string | undefined, artifacts?: ArtifactRef[]) => {
  if (!artifactId || !artifacts?.length) return undefined;
  return artifacts.find((artifact) => artifact.artifact_id === artifactId);
};

export const ErrorSummary = ({ failure }: { failure?: ErrorEnvelope | null }) => {
  if (!failure) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-700" />
      <span className="shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[11px] text-red-800">
        {failure.code || 'runtime.failure'}
      </span>
      <span className="min-w-0 truncate text-neutral-800">{failure.desc || 'Runtime failure'}</span>
    </div>
  );
};

export const ErrorDetails = ({ failure }: { failure?: ErrorEnvelope | null }) => {
  if (!failure) return null;
  const details = isRecord(failure.details) ? failure.details : {};
  const message = text(details.message);
  const fields = [
    ['Category', detailValue(failure, 'category')],
    ['Retryable', details.retryable === true ? 'yes' : details.retryable === false ? 'no' : ''],
    ['Step', detailValue(failure, 'step_id')],
    ['Agent', detailValue(failure, 'agent_id')],
    ['Attempt', [detailValue(failure, 'attempt'), detailValue(failure, 'max_attempts')].filter(Boolean).join(' / ')],
    ['Event', failure.event_id || ''],
  ].filter(([, value]) => value);

  return (
    <div className="space-y-2">
      {message ? <div className="text-xs leading-5 text-neutral-800">{message}</div> : null}
      {fields.length ? (
        <div className="grid gap-1 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0 text-xs">
              <span className="text-neutral-500">{label}: </span>
              <span className="font-medium text-neutral-800">{value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export function FailurePanel({ failure, title = 'Failure', compact = false, artifacts }: FailurePanelProps) {
  if (!failure) return null;
  const links = (failure.links || []).filter((link) => link?.artifact_id || link?.url);
  return (
    <section className="rounded-md border border-red-200 bg-red-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold uppercase text-red-800">{title}</div>
          <ErrorSummary failure={failure} />
        </div>
        <span className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-red-800">
          {failure.severity || 'ERROR'}
        </span>
      </div>
      {!compact ? (
        <div className="mt-3 space-y-3">
          <ErrorDetails failure={failure} />
          {failure.remediation ? (
            <div className="border-t border-red-100 pt-2 text-xs leading-5 text-neutral-800">
              <span className="font-semibold text-neutral-950">Remediation: </span>
              {failure.remediation}
            </div>
          ) : null}
          {links.length ? (
            <div className="flex flex-wrap gap-2 border-t border-red-100 pt-2">
              {links.map((link, index) => {
                const artifact = artifactForLink(link.artifact_id, artifacts);
                const revealUrl = artifact?.reveal_url;
                const href = link.url || artifact?.url;
                const label = artifactDisplayName(artifact || { artifact_id: link.artifact_id }, link.rel || 'artifact');
                const size = formatBytes(artifact?.size_bytes);
                const content = (
                  <>
                    {revealUrl || href ? <ExternalLink className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    <span>{label}</span>
                    {size ? <span className="text-neutral-500">{size}</span> : null}
                  </>
                );
                const className = "inline-flex h-7 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2 text-xs font-medium text-neutral-800";
                return revealUrl ? (
                  <button key={`${label}-${index}`} type="button" onClick={() => openArtifactLocation(revealUrl, label)} className={className}>
                    {content}
                  </button>
                ) : href ? (
                  <a key={`${label}-${index}`} href={href} target="_blank" rel="noreferrer" className={className}>
                    {content}
                  </a>
                ) : (
                  <span key={`${label}-${index}`} className={className}>
                    {content}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default FailurePanel;
