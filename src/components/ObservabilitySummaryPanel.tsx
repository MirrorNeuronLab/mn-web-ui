import { Network } from 'lucide-react';
import { toast } from 'sonner';
import { revealArtifact } from '../api';
import { artifactDisplayName } from '../utils/artifacts';
import { formatElapsed } from './WorkflowProgressPanel';

export type ObservabilityArtifactRef = {
  artifact_id?: string;
  url?: string;
  reveal_url?: string;
  size_bytes?: number;
  path?: string;
  relative_path?: string;
};

type Props = {
  summary?: Record<string, unknown>;
  traceId?: string;
  artifacts?: ObservabilityArtifactRef[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const numericValue = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
};

const artifactLink = (artifacts: ObservabilityArtifactRef[] | undefined, artifactId: string): ObservabilityArtifactRef | undefined => (
  artifacts?.find((artifact) => artifact.artifact_id === artifactId)
);

const formatCount = (value: unknown): string => {
  const number = numericValue(value);
  return typeof number === 'number' ? number.toLocaleString() : '0';
};

const formatPeak = (value: unknown, suffix: string): string | undefined => {
  const number = numericValue(value);
  if (typeof number !== 'number') return undefined;
  return `${Math.round(number * 10) / 10}${suffix}`;
};

const openArtifactLocation = (artifact: ObservabilityArtifactRef) => {
  if (!artifact.reveal_url) return;
  const label = artifactDisplayName(artifact);
  void revealArtifact(artifact.reveal_url)
    .then(() => toast.message('Opened file location', { description: label }))
    .catch(() => toast.error('Could not open file location', { description: label }));
};

export default function ObservabilitySummaryPanel({ summary, traceId, artifacts }: Props) {
  if (!summary && !traceId) return null;
  const summaryCounts = summary?.counts;
  const summaryResources = summary?.resource_peaks;
  const summaryTokens = summary?.token_totals;
  const counts = isRecord(summaryCounts) ? summaryCounts : {};
  const resources = isRecord(summaryResources) ? summaryResources : {};
  const tokens = isRecord(summaryTokens) ? summaryTokens : {};
  const durationMs = numericValue(summary?.duration_ms);
  const durationText = typeof durationMs === 'number' ? formatElapsed(durationMs / 1000) : 'unknown';
  const memoryPeak = formatPeak(resources.max_memory_rss_mb, ' MB');
  const cpuPeak = formatPeak(resources.max_cpu_pct, '% CPU');
  const tokenTotal = numericValue(tokens.total_tokens);
  const links = [
    ['timeline_jsonl', 'Timeline'],
    ['events_jsonl', 'Events'],
    ['logs_jsonl', 'Logs'],
    ['errors_jsonl', 'Errors'],
  ] as const;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
          <Network className="h-4 w-4 text-neutral-500" />
          Observability Summary
        </div>
        {traceId ? <span className="font-mono text-[11px] text-neutral-500">{traceId}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <div>
          <div className="text-[11px] font-medium text-neutral-500">Duration</div>
          <div className="mt-0.5 font-semibold text-neutral-950">{durationText}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-neutral-500">Events / Logs / Errors</div>
          <div className="mt-0.5 font-semibold text-neutral-950">{formatCount(counts.events)} / {formatCount(counts.logs)} / {formatCount(counts.errors)}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-neutral-500">Warnings / Retries</div>
          <div className="mt-0.5 font-semibold text-neutral-950">{formatCount(counts.warnings)} / {formatCount(summary?.retry_count)}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-neutral-500">Resources / Tokens</div>
          <div className="mt-0.5 font-semibold text-neutral-950">{memoryPeak || cpuPeak || 'none'}{typeof tokenTotal === 'number' && tokenTotal > 0 ? ` / ${tokenTotal.toLocaleString()}` : ''}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map(([artifactId, label]) => {
          const artifact = artifactLink(artifacts, artifactId);
          if (!artifact?.url && !artifact?.reveal_url) return null;
          const displayLabel = artifactDisplayName(artifact, label);
          const className = "rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:border-neutral-300 hover:bg-white";
          return artifact.reveal_url ? (
            <button key={artifactId} type="button" onClick={() => openArtifactLocation(artifact)} className={className}>
              {displayLabel}
            </button>
          ) : (
            <a key={artifactId} href={artifact.url} target="_blank" rel="noreferrer" className={className}>
              {displayLabel}
            </a>
          );
        })}
      </div>
    </div>
  );
}
