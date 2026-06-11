/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { Activity, Check, Circle, Clock3, ExternalLink, FileText, Loader2, MousePointer2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JobDetails, WorkflowActivity, WorkflowProgress, WorkflowProgressAgent, WorkflowProgressStep } from '../api';
import { revealArtifact } from '../api';
import { displayAgentName } from '../utils/agentGraph';
import { artifactDisplayName, isOpenableHref } from '../utils/artifacts';
import FailurePanel, { ErrorSummary } from './FailurePanel';

type WorkflowProgressPanelProps = {
  progress: WorkflowProgress | null;
  status?: string;
  details?: JobDetails | null;
  webUi?: {
    url: string;
    title: string;
    status?: string;
  } | null;
  showFailurePanel?: boolean;
};

type ProgressResource = {
  id: string;
  label: string;
  value: string;
  href?: string;
  revealUrl?: string;
  kind: 'file' | 'url' | 'input' | 'text';
};

type FailureArtifact = {
  artifact_id?: string;
  relative_path?: string;
  path?: string;
  url?: string;
  reveal_url?: string;
  size_bytes?: number;
};

const statusTone = (status: string | undefined) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'done', 'succeeded'].includes(normalized)) return 'text-emerald-700';
  if (['partial', 'skipped'].includes(normalized)) return 'text-amber-700';
  if (['failed', 'cancelled', 'error'].includes(normalized)) return 'text-red-700';
  if (['running', 'active'].includes(normalized)) return 'text-sky-700';
  if (['retry_wait', 'blocked', 'paused', 'pausing', 'queued'].includes(normalized)) return 'text-amber-700';
  if (['idle', 'ready'].includes(normalized)) return 'text-neutral-600';
  return 'text-neutral-500';
};

const StatusGlyph = ({ status, current }: { status?: string; current?: boolean }) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'done', 'succeeded'].includes(normalized)) return <Check className="h-3.5 w-3.5 text-emerald-700" />;
  if (['partial', 'skipped'].includes(normalized)) return <Circle className="h-3.5 w-3.5 text-amber-600" />;
  if (['failed', 'cancelled', 'error'].includes(normalized)) return <X className="h-3.5 w-3.5 text-red-700" />;
  if (current || ['running', 'active'].includes(normalized)) return <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-700" />;
  if (['retry_wait', 'blocked', 'paused', 'pausing', 'queued'].includes(normalized)) return <Clock3 className="h-3.5 w-3.5 text-amber-600" />;
  if (['idle', 'ready'].includes(normalized)) return <Circle className="h-3.5 w-3.5 text-neutral-500" />;
  if (['pending', 'scheduled', 'validated', 'preparing'].includes(normalized)) return <Clock3 className="h-3.5 w-3.5 text-neutral-500" />;
  return <Circle className="h-3.5 w-3.5 text-neutral-400" />;
};

export const formatElapsed = (seconds?: number) => {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
};

const formatProgress = (agent: WorkflowProgressAgent) => {
  const parts = [`${Math.round(Math.max(0, Math.min(1, agent.progress || 0)) * 100)}%`];
  if (agent.tokens) parts.push(`${formatTokens(agent.tokens)} tok`);
  if (agent.tools !== null && agent.tools !== undefined) parts.push(`${agent.tools} tools`);
  if (agent.elapsed_seconds) parts.push(formatElapsed(agent.elapsed_seconds));
  return parts.join(' · ');
};

const formatTokens = (tokens: number) => {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens % 1000 === 0 ? 0 : 1)}k`;
  return String(tokens);
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatClock = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatList = (values?: string[]) => {
  const filtered = (values || []).filter(Boolean);
  return filtered.length ? filtered.join(', ') : 'None';
};

const eventKey = (event: WorkflowActivity, index: number) => (
  `${event.timestamp || 'unknown'}-${event.type || 'event'}-${event.step_id || ''}-${event.agent_id || ''}-${index}`
);

const activityMessage = (event: WorkflowActivity) => (
  event.message || event.status || event.type || 'Activity observed'
);

const uniqueActivities = (activities: WorkflowActivity[]) => {
  const seen = new Set<string>();
  return activities.filter((event) => {
    const key = `${event.timestamp || 'unknown'}-${event.type || 'event'}-${event.step_id || ''}-${event.agent_id || ''}-${event.message || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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

const resourceFromValue = (value: unknown, id: string, fallbackLabel?: string): ProgressResource | null => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (!text) return null;
    return {
      id,
      label: fallbackLabel || displayNameFromPath(text),
      value: text,
      href: isOpenableHref(text) ? text : undefined,
      kind: isUrl(text) ? 'url' : text.includes('/') || text.includes('.') ? 'file' : 'text',
    };
  }
  if (!isRecord(value)) return null;
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
  const rawValue = artifact.relative_path || artifact.path || value.file || value.file_path || value.local_path || value.value || artifact.url || value.href || artifact.name;
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') return null;
  const text = String(rawValue).trim();
  if (!text) return null;
  const hrefValue = stringProp(value, 'url') || stringProp(value, 'href');
  const label = artifactDisplayName(artifact, fallbackLabel || displayNameFromPath(text));
  return {
    id,
    label,
    value: text,
    href: isOpenableHref(hrefValue) ? hrefValue : isOpenableHref(text) ? text : undefined,
    revealUrl: artifact.reveal_url,
    kind: isUrl(hrefValue || text) ? 'url' : 'file',
  };
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

const artifactsFromDetails = (details?: JobDetails | null) => {
  const root = details as Record<string, unknown> | null | undefined;
  const artifacts = root?.artifacts || root?.output_files || details?.job?.artifacts;
  return Array.isArray(artifacts) ? artifacts.filter(isRecord) as FailureArtifact[] : [];
};

export const buildOutputResources = (progress: WorkflowProgress, details?: JobDetails | null): ProgressResource[] => {
  const detailRoot = details as Record<string, unknown> | null | undefined;
  const job = isRecord(details?.job) ? details.job : {};
  const summary = isRecord(details?.summary) ? details.summary : {};
  const events = [...(progress.recent_events || []), ...(details?.recent_events || [])];
  return uniqueResources([
    ...collectResources(progress, ['outputs', 'output', 'artifacts', 'artifact', 'files', 'urls', 'results', 'result'], 'progress'),
    ...progress.steps.flatMap((step, index) => collectResources(step, ['outputs', 'output', 'artifacts', 'files', 'provides'], `step-${index}`)),
    ...collectResources(detailRoot, ['outputs', 'output', 'artifacts', 'artifact', 'files', 'urls', 'results', 'result'], 'details'),
    ...collectResources(job, ['outputs', 'output', 'artifacts', 'artifact', 'files', 'urls', 'results', 'result'], 'job'),
    ...collectResources(summary, ['outputs', 'output', 'artifacts', 'artifact', 'files', 'urls', 'results', 'result'], 'summary'),
    ...events.flatMap((event, index) => collectResources(event.payload, ['outputs', 'output', 'artifacts', 'artifact', 'files', 'urls', 'results', 'result'], `event-${index}`)),
  ]);
};

const buildInputResources = (progress: WorkflowProgress, details?: JobDetails | null): ProgressResource[] => {
  const detailRoot = details as Record<string, unknown> | null | undefined;
  const job = isRecord(details?.job) ? details.job : {};
  const summary = isRecord(details?.summary) ? details.summary : {};
  return uniqueResources([
    ...collectResources(progress, ['inputs', 'input', 'sources', 'source'], 'progress-input'),
    ...progress.steps.flatMap((step, index) => collectResources(step, ['inputs', 'input', 'sources', 'source', 'requires'], `step-input-${index}`)),
    ...collectResources(detailRoot, ['inputs', 'input', 'sources', 'source'], 'details-input'),
    ...collectResources(job, ['inputs', 'input', 'sources', 'source'], 'job-input'),
    ...collectResources(summary, ['inputs', 'input', 'sources', 'source', 'config'], 'summary-input'),
  ]).map((resource) => ({ ...resource, kind: resource.kind === 'url' ? resource.kind : 'input' }));
};

const openResourceLocation = (resource: ProgressResource) => {
  if (!resource.revealUrl) return;
  void revealArtifact(resource.revealUrl)
    .then(() => toast.message('Opened file location', { description: resource.label }))
    .catch(() => toast.error('Could not open file location', { description: resource.label }));
};

const ResourceList = ({ resources, emptyText }: { resources: ProgressResource[]; emptyText: string }) => (
  <div className="space-y-1">
    {resources.length ? resources.slice(0, 8).map((resource) => {
      const icon = resource.kind === 'url' ? <ExternalLink className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />;
      const content = (
        <>
          {icon}
          <span className="min-w-0 truncate">{resource.label}</span>
        </>
      );
      const className = "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-neutral-900 hover:bg-neutral-100";
      return resource.revealUrl ? (
        <button key={resource.id} type="button" className={className} onClick={() => openResourceLocation(resource)} title={`Open ${resource.label} in local file system`}>
          {content}
        </button>
      ) : resource.href ? (
        <a key={resource.id} className={className} href={resource.href} target="_blank" rel="noreferrer" title={resource.value}>
          {content}
        </a>
      ) : (
        <div key={resource.id} className={className} title={resource.value}>
          {content}
        </div>
      );
    }) : <div className="px-2 py-1 text-xs text-neutral-500">{emptyText}</div>}
  </div>
);

const ProgressResourcesColumn = ({ progress, details, webUi }: { progress: WorkflowProgress; details?: JobDetails | null; webUi?: WorkflowProgressPanelProps['webUi'] }) => {
  const outputs = buildOutputResources(progress, details);
  const inputs = buildInputResources(progress, details);
  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <div className="space-y-4">
        <section>
          <div className="mb-2 text-xs font-semibold text-neutral-500">Outputs</div>
          <ResourceList resources={outputs} emptyText="No outputs yet" />
        </section>

        <section className="border-t border-neutral-200 pt-4">
          <div className="mb-2 text-xs font-semibold text-neutral-500">Browser</div>
          {webUi?.url ? (
            <a
              className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-neutral-900 hover:bg-neutral-100"
              href={webUi.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open dashboard in browser: ${webUi.title || webUi.url}`}
              title={webUi.status ? `${webUi.title} (${webUi.status})` : webUi.title}
            >
              <MousePointer2 className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{webUi.title || webUi.url}</span>
            </a>
          ) : (
            <div className="flex h-7 items-center gap-2 px-2 text-xs text-neutral-400">
              <MousePointer2 className="h-3.5 w-3.5 shrink-0" />
              <span>No dashboard yet</span>
            </div>
          )}
        </section>

        <section className="border-t border-neutral-200 pt-4">
          <div className="mb-2 text-xs font-semibold text-neutral-500">Inputs</div>
          <ResourceList resources={inputs} emptyText="No inputs reported yet" />
        </section>
      </div>
    </div>
  );
};

const StepRow = ({
  step,
  index,
  workflowKind,
  showLayer,
  highlighted,
  selected,
  onSelect,
}: {
  step: WorkflowProgressStep;
  index: number;
  workflowKind: string;
  showLayer: boolean;
  highlighted: boolean;
  selected: boolean;
  onSelect: () => void;
}) => {
  const count = workflowKind === 'service' ? (step.ready_count || step.done_count || 0) : (step.done_count || 0);
  const mutedText = highlighted ? 'text-neutral-300' : 'text-neutral-500';
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-current={step.current ? 'step' : undefined}
      onClick={onSelect}
      className={`grid w-full grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 ${
        highlighted
          ? 'bg-neutral-950 text-white'
          : step.current
            ? 'bg-neutral-100 text-neutral-950 hover:bg-neutral-200'
            : 'text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      <StatusGlyph status={step.status} current={step.current} />
      <div className="min-w-0">
        <div className="truncate font-medium">
          {showLayer ? <span className={highlighted ? 'text-neutral-300' : 'text-neutral-400'}>L{(step.layer || 0) + 1} </span> : null}
          {index + 1}. {step.label}
        </div>
        {step.activity_summary || step.goal ? (
          <div className={`truncate text-xs ${mutedText}`}>{step.activity_summary || step.goal}</div>
        ) : null}
      </div>
      <div className={`font-mono text-[11px] ${highlighted ? 'text-neutral-200' : 'text-neutral-500'}`}>
        {count}/{step.total_count}
      </div>
    </button>
  );
};

const AgentRow = ({ agent }: { agent: WorkflowProgressAgent }) => {
  const progress = Math.max(0, Math.min(1, agent.progress || 0));
  const agentName = displayAgentName({
    id: agent.id,
    alias: agent.alias,
    display_name: agent.display_name,
  });
  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="max-w-[260px] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusGlyph status={agent.status} current={agent.status === 'running'} />
          <span className="truncate font-mono text-xs font-medium text-neutral-950" title={agent.id}>{agentName}</span>
        </div>
      </td>
      <td className="w-[110px] px-3 py-2 text-xs">
        <span className={`capitalize ${statusTone(agent.status)}`}>{agent.status || 'unknown'}</span>
      </td>
      <td className="max-w-[320px] px-3 py-2 text-xs text-neutral-700">
        {agent.failure ? (
          <ErrorSummary failure={agent.failure} />
        ) : (
          <div className="space-y-0.5">
            <div className="truncate" title={agent.status_reason || agent.working_on || undefined}>
              {agent.status_reason || agent.working_on || agent.role || 'worker'}
            </div>
            {agent.activity_summary && agent.activity_summary !== agent.status_reason ? (
              <div className="truncate text-[11px] text-neutral-500" title={agent.activity_summary}>{agent.activity_summary}</div>
            ) : null}
          </div>
        )}
      </td>
      <td className="max-w-[210px] px-3 py-2 text-xs text-neutral-600">
        <div className="truncate">{agent.model || 'runtime'}</div>
        {agent.assigned_node ? <div className="truncate text-[11px] text-neutral-400">{agent.assigned_node}</div> : null}
      </td>
      <td className="w-[180px] px-3 py-2 text-xs text-neutral-600">
        <div className="space-y-0.5">
          <div className="whitespace-nowrap">{formatElapsed(agent.elapsed_seconds || 0)}</div>
          {agent.attempt ? <div className="whitespace-nowrap text-[11px] text-neutral-500">Attempt {agent.attempt}</div> : null}
          {agent.retry_at ? <div className="whitespace-nowrap text-[11px] text-amber-700">Retry {formatClock(agent.retry_at)}</div> : null}
          {agent.deadline_at ? <div className="whitespace-nowrap text-[11px] text-neutral-500">Deadline {formatClock(agent.deadline_at)}</div> : null}
        </div>
      </td>
      <td className="w-[220px] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full bg-neutral-950" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="whitespace-nowrap font-mono text-[11px] text-neutral-600">{formatProgress(agent)}</span>
        </div>
      </td>
    </tr>
  );
};

const DetailStat = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
  <div className="min-w-0 rounded-md border border-neutral-200 bg-white px-2.5 py-2">
    <div className="text-[11px] font-medium text-neutral-500">{label}</div>
    <div className={`mt-0.5 truncate text-xs font-semibold ${tone || 'text-neutral-950'}`} title={String(value)}>{value}</div>
  </div>
);

const StepMetadata = ({ step }: { step: WorkflowProgressStep }) => {
  const metadata = [
    ['Started', formatTimestamp(step.started_at)],
    ['Ended', formatTimestamp(step.ended_at)],
    ['Last activity', formatTimestamp(step.last_activity?.timestamp || step.last_event_at)],
    ['Retry', formatTimestamp(step.retry_at)],
    ['Deadline', formatTimestamp(step.deadline_at)],
    ['Heartbeat', formatTimestamp(step.heartbeat_deadline_at)],
    ['Requires', formatList(step.requires)],
    ['Provides', formatList(step.provides)],
  ].filter(([, value]) => value && value !== 'None');
  return metadata.length ? (
    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {metadata.map(([label, value]) => <DetailStat key={label} label={label} value={value} />)}
    </div>
  ) : null;
};

const ActivityList = ({ activities, fallbackMessages }: { activities: WorkflowActivity[]; fallbackMessages: string[] }) => (
  <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent activity</div>
    <div className="space-y-1 font-mono text-xs text-neutral-600">
      {activities.length ? activities.slice(-8).map((event, index) => (
        <div key={eventKey(event, index)} className="grid grid-cols-[72px_1fr] gap-2">
          <span className="text-neutral-400">{formatClock(event.timestamp) || 'unknown'}</span>
          <span className="min-w-0 truncate" title={activityMessage(event)}>
            {event.agent_id ? `${event.agent_id}: ` : ''}{activityMessage(event)}
          </span>
        </div>
      )) : fallbackMessages.slice(-4).map((message, index) => (
        <div key={`${message}-${index}`} className="truncate">{message}</div>
      ))}
      {activities.length === 0 && fallbackMessages.length === 0 ? <div>No workflow events observed yet.</div> : null}
    </div>
  </div>
);

export function WorkflowProgressPanel({ progress, details, webUi, showFailurePanel = true }: WorkflowProgressPanelProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  if (!progress) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white font-mono text-xs text-neutral-500">
        Loading workflow progress...
      </div>
    );
  }

  const currentStep = progress.current_step || progress.steps.find((step) => step.current) || progress.steps[0];
  const effectiveSelectedStepId = selectedStepId && progress.steps.some((step) => step.id === selectedStepId) ? selectedStepId : null;
  const selectedStep = effectiveSelectedStepId
    ? progress.steps.find((step) => step.id === effectiveSelectedStepId) || (currentStep?.id === effectiveSelectedStepId ? currentStep : undefined)
    : undefined;
  const currentStepIds = new Set(progress.current_step_ids?.length ? progress.current_step_ids : progress.steps.filter((step) => step.current).map((step) => step.id));
  const activeSteps = currentStepIds.size
    ? progress.steps
        .filter((step) => currentStepIds.has(step.id))
        .map((step) => currentStep?.id === step.id && (currentStep.agents || []).length ? currentStep : step)
    : (currentStep ? [currentStep] : []);
  const detailSteps = selectedStep ? [selectedStep] : activeSteps;
  const agents = detailSteps.flatMap((step) => step.agents || []);
  const workflowKind = progress.workflow_kind || 'batch';
  const showLayer = (progress.layers || []).length > 1 || progress.steps.some((step) => step.parents?.length || step.children?.length);
  const primaryStep = selectedStep || currentStep;
  const visibleFailure = progress.failure || primaryStep?.failure || agents.find((agent) => agent.failure)?.failure;
  const failureArtifacts = artifactsFromDetails(details);
  const activityEvents = uniqueActivities(detailSteps.flatMap((step) => step.recent_events || []))
    .sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
  const stepTitle = selectedStep
    ? selectedStep.label
    : activeSteps.length > 1
      ? `${activeSteps.length} active steps`
      : (currentStep?.label || 'Agents');
  const stepSubtitle = selectedStep
    ? (selectedStep.goal || selectedStep.activity_summary || selectedStep.id || '')
    : activeSteps.length > 1
      ? activeSteps.map((step) => step.label).join(' / ')
      : (currentStep?.goal || currentStep?.activity_summary || '');
  const detailStatus = selectedStep?.status || currentStep?.status || progress.status;

  return (
    <div className="absolute inset-0 overflow-auto bg-white font-sans lg:overflow-hidden">
      <div className="grid min-h-[480px] grid-cols-1 lg:h-full lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-neutral-200 p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-2 text-xs font-semibold text-neutral-950">Steps</div>
          <div className="space-y-0.5">
            {progress.steps.map((step, index) => (
              <StepRow
                key={step.id || index}
                step={step}
                index={index}
                workflowKind={workflowKind}
                showLayer={showLayer}
                highlighted={effectiveSelectedStepId ? step.id === effectiveSelectedStepId : Boolean(step.current)}
                selected={step.id === effectiveSelectedStepId}
                onSelect={() => setSelectedStepId(step.id || null)}
              />
            ))}
          </div>
          <ProgressResourcesColumn progress={progress} details={details} webUi={webUi} />
        </aside>

        <section className="min-w-0 p-3 lg:min-h-0 lg:overflow-auto">
          {showFailurePanel && visibleFailure ? (
            <div className="mb-3">
              <FailurePanel failure={visibleFailure} title={progress.failure ? 'Job Failure' : 'Step Failure'} artifacts={failureArtifacts} />
            </div>
          ) : null}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-neutral-950">
                {stepTitle} · {agents.length} agents
              </div>
              {stepSubtitle ? <div className="truncate text-xs text-neutral-500">{stepSubtitle}</div> : null}
            </div>
            <div className="flex items-center gap-2">
              {selectedStep ? (
                <button
                  type="button"
                  onClick={() => setSelectedStepId(null)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Active steps
                </button>
              ) : null}
              <div className={`text-[11px] font-medium capitalize ${statusTone(detailStatus)}`}>{detailStatus || 'unknown'}</div>
            </div>
          </div>

          {selectedStep ? (
            <div className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <DetailStat label="Done" value={`${selectedStep.done_count}/${selectedStep.total_count}`} />
                <DetailStat label="Running" value={selectedStep.running_count} tone={selectedStep.running_count ? 'text-sky-700' : undefined} />
                <DetailStat label="Idle" value={selectedStep.idle_count} />
                <DetailStat label="Failed" value={selectedStep.failed_count} tone={selectedStep.failed_count ? 'text-red-700' : undefined} />
                <DetailStat label="Elapsed" value={formatElapsed(selectedStep.elapsed_seconds || 0)} />
              </div>
              {(selectedStep.status_reason || selectedStep.activity_summary || selectedStep.attempt || selectedStep.attempt_id) ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-600">
                  {selectedStep.status_reason ? <span className="rounded-md bg-white px-2 py-1">{selectedStep.status_reason}</span> : null}
                  {selectedStep.activity_summary ? <span className="rounded-md bg-white px-2 py-1">{selectedStep.activity_summary}</span> : null}
                  {selectedStep.attempt ? <span className="rounded-md bg-white px-2 py-1">Attempt {selectedStep.attempt}</span> : null}
                  {selectedStep.attempt_id ? <span className="rounded-md bg-white px-2 py-1 font-mono">{selectedStep.attempt_id}</span> : null}
                </div>
              ) : null}
              <StepMetadata step={selectedStep} />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full min-w-[900px] table-fixed text-left">
              <thead className="bg-neutral-50 text-[11px] text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Working on</th>
                  <th className="px-3 py-2 font-medium">Runtime</th>
                  <th className="px-3 py-2 font-medium">Timing</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {agents.length ? agents.map((agent) => <AgentRow key={agent.id} agent={agent} />) : (
                  <tr>
                    <td className="px-3 py-6 text-xs text-neutral-500" colSpan={6}>No agents reported for this step yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <ActivityList activities={activityEvents} fallbackMessages={progress.messages || []} />
        </section>
      </div>
    </div>
  );
}

export default WorkflowProgressPanel;
