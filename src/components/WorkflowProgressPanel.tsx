/* eslint-disable react-refresh/only-export-components */
import { Check, Circle, Clock3, ExternalLink, FileText, Loader2, MousePointer2, X } from 'lucide-react';
import type { JobDetails, WorkflowProgress, WorkflowProgressAgent, WorkflowProgressStep } from '../api';
import { displayAgentName } from '../utils/agentGraph';
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
};

type ProgressResource = {
  id: string;
  label: string;
  value: string;
  href?: string;
  kind: 'file' | 'url' | 'input' | 'text';
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

const resourceFromValue = (value: unknown, id: string, fallbackLabel?: string): ProgressResource | null => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (!text) return null;
    return {
      id,
      label: fallbackLabel || displayNameFromPath(text),
      value: text,
      href: isUrl(text) ? text : undefined,
      kind: isUrl(text) ? 'url' : text.includes('/') || text.includes('.') ? 'file' : 'text',
    };
  }
  if (!isRecord(value)) return null;
  const rawValue = value.url || value.href || value.path || value.file || value.file_path || value.local_path || value.value || value.name;
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') return null;
  const text = String(rawValue).trim();
  if (!text) return null;
  const label = [value.label, value.title, value.name, fallbackLabel].find((candidate) => typeof candidate === 'string' && candidate.trim());
  return {
    id,
    label: typeof label === 'string' ? label.trim() : displayNameFromPath(text),
    value: text,
    href: isUrl(text) ? text : undefined,
    kind: isUrl(text) ? 'url' : 'file',
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
    const key = `${resource.kind}:${resource.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const artifactsFromDetails = (details?: JobDetails | null) => {
  const root = details as Record<string, unknown> | null | undefined;
  const artifacts = root?.artifacts || root?.output_files || details?.job?.artifacts;
  return Array.isArray(artifacts) ? artifacts.filter(isRecord) as any[] : [];
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
      return resource.href ? (
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

const StepRow = ({ step, index, workflowKind, showLayer }: { step: WorkflowProgressStep; index: number; workflowKind: string; showLayer: boolean }) => {
  const count = workflowKind === 'service' ? (step.ready_count || step.done_count || 0) : (step.done_count || 0);
  return (
    <div
      className={`grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
        step.current ? 'bg-neutral-950 text-white' : 'text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      <StatusGlyph status={step.status} current={step.current} />
      <div className="min-w-0">
        <div className="truncate font-medium">
          {showLayer ? <span className={step.current ? 'text-neutral-300' : 'text-neutral-400'}>L{(step.layer || 0) + 1} </span> : null}
          {index + 1}. {step.label}
        </div>
        {step.goal ? <div className={`truncate text-xs ${step.current ? 'text-neutral-300' : 'text-neutral-500'}`}>{step.goal}</div> : null}
      </div>
      <div className={`font-mono text-[11px] ${step.current ? 'text-neutral-200' : 'text-neutral-500'}`}>
        {count}/{step.total_count}
      </div>
    </div>
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
      <td className="max-w-[340px] px-3 py-2 text-xs text-neutral-700">
        {agent.failure ? (
          <ErrorSummary failure={agent.failure} />
        ) : (
          <div className="truncate" title={agent.status_reason || undefined}>
            {agent.status_reason || agent.working_on || agent.role || 'worker'}
          </div>
        )}
      </td>
      <td className="max-w-[220px] px-3 py-2 text-xs text-neutral-600">
        <div className="truncate">{agent.model || 'runtime'}</div>
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

export function WorkflowProgressPanel({ progress, details, webUi }: WorkflowProgressPanelProps) {
  if (!progress) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white font-mono text-xs text-neutral-500">
        Loading workflow progress...
      </div>
    );
  }

  const currentStep = progress.current_step || progress.steps.find((step) => step.current) || progress.steps[0];
  const currentStepIds = new Set(progress.current_step_ids?.length ? progress.current_step_ids : progress.steps.filter((step) => step.current).map((step) => step.id));
  const activeSteps = currentStepIds.size
    ? progress.steps
        .filter((step) => currentStepIds.has(step.id))
        .map((step) => currentStep?.id === step.id && (currentStep.agents || []).length ? currentStep : step)
    : (currentStep ? [currentStep] : []);
  const agents = activeSteps.flatMap((step) => step.agents || []);
  const workflowKind = progress.workflow_kind || 'batch';
  const showLayer = (progress.layers || []).length > 1 || progress.steps.some((step) => step.parents?.length || step.children?.length);
  const visibleFailure = progress.failure || currentStep?.failure || agents.find((agent) => agent.failure)?.failure;
  const failureArtifacts = artifactsFromDetails(details);

  return (
    <div className="absolute inset-0 overflow-auto bg-white font-sans lg:overflow-hidden">
      <div className="grid min-h-[480px] grid-cols-1 lg:h-full lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-neutral-200 p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-2 text-xs font-semibold text-neutral-950">Steps</div>
          <div className="space-y-0.5">
            {progress.steps.map((step, index) => (
              <StepRow key={step.id || index} step={step} index={index} workflowKind={workflowKind} showLayer={showLayer} />
            ))}
          </div>
          <ProgressResourcesColumn progress={progress} details={details} webUi={webUi} />
        </aside>

        <section className="min-w-0 p-3 lg:min-h-0 lg:overflow-auto">
          <div className="mb-3">
            <FailurePanel failure={visibleFailure} title={progress.failure ? 'Job Failure' : 'Step Failure'} artifacts={failureArtifacts} />
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-neutral-950">
                {activeSteps.length > 1 ? `${activeSteps.length} active steps` : (currentStep?.label || 'Agents')} · {agents.length} agents
              </div>
              {activeSteps.length > 1 ? (
                <div className="truncate text-xs text-neutral-500">{activeSteps.map((step) => step.label).join(' / ')}</div>
              ) : currentStep?.goal ? <div className="truncate text-xs text-neutral-500">{currentStep.goal}</div> : null}
            </div>
            <div className={`text-[11px] font-medium capitalize ${statusTone(currentStep?.status)}`}>{currentStep?.status || 'unknown'}</div>
          </div>

          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full min-w-[680px] table-fixed text-left">
              <thead className="bg-neutral-50 text-[11px] text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Working on</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {agents.length ? agents.map((agent) => <AgentRow key={agent.id} agent={agent} />) : (
                  <tr>
                    <td className="px-3 py-6 text-xs text-neutral-500" colSpan={5}>No agents reported for this step yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent activity</div>
            <div className="space-y-1 font-mono text-xs text-neutral-600">
              {(progress.messages || []).slice(-4).map((message, index) => (
                <div key={`${message}-${index}`} className="truncate">{message}</div>
              ))}
              {(!progress.messages || progress.messages.length === 0) ? <div>No workflow events observed yet.</div> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default WorkflowProgressPanel;
