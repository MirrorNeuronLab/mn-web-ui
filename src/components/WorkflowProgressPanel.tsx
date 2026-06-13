import { useState } from 'react';
import { Activity, Check, Circle, Clock3, ExternalLink, FileText, Loader2, MousePointer2, X } from 'lucide-react';
import type { JobDetails, WorkflowActivity, WorkflowProgress, WorkflowProgressAgent, WorkflowProgressStep } from '../api';
import { displayAgentName } from '../utils/agentGraph';
import { formatElapsed } from '../utils/workflowProgress';
import { artifactsFromDetails, buildInputResources, buildOutputResources } from '../utils/workflowResources';
import type { ProgressResource } from '../utils/workflowResources';
import { openArtifactLocation } from '../utils/artifactReveal';
import {
  activityCategory,
  activityDetailText,
  activityMessage,
  categoryTone,
  filterLabel,
  uniqueActivities,
  type ActivityFilter,
} from '../utils/workflowActivity';
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
        <button key={resource.id} type="button" className={className} onClick={() => openArtifactLocation(resource.revealUrl, resource.label)} title={`Open ${resource.label} in local file system`}>
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

const ActivityList = ({ activities, fallbackMessages }: { activities: WorkflowActivity[]; fallbackMessages: string[] }) => {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const filters: ActivityFilter[] = ['all', 'agent', 'tool', 'system', 'artifact', 'error'];
  const visibleActivities = activities.filter((event) => filter === 'all' || activityCategory(event) === filter);
  const rows = visibleActivities.slice(-12);

  return (
    <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent activity</div>
        {activities.length ? (
          <div className="flex flex-wrap gap-1">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`h-6 rounded-md border px-2 text-[11px] font-medium ${filter === item ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100'}`}
              >
                {filterLabel(item)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5 font-mono text-xs text-neutral-600">
        {rows.length ? rows.map((event, index) => {
          const category = activityCategory(event);
          const detailText = activityDetailText(event);
          return (
            <div key={eventKey(event, index)} className="rounded-md bg-white px-2 py-1.5">
              <div className="grid grid-cols-[72px_76px_1fr] gap-2">
                <span className="text-neutral-400">{formatClock(event.timestamp) || 'unknown'}</span>
                <span className={`inline-flex h-5 w-fit items-center rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide ${categoryTone(category)}`}>
                  {filterLabel(category)}
                </span>
                <span className="min-w-0 truncate" title={activityMessage(event)}>
                  {event.agent_id ? `${event.agent_id}: ` : ''}{activityMessage(event)}
                </span>
              </div>
              {(event.target || event.result_summary || detailText) ? (
                <details className="mt-1 pl-[148px] text-[11px] text-neutral-500">
                  <summary className="cursor-pointer select-none truncate">
                    {event.target || event.result_summary || 'Details'}
                  </summary>
                  {event.result_summary ? <div className="mt-1 whitespace-pre-wrap">{event.result_summary}</div> : null}
                  {detailText ? <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2">{detailText}</pre> : null}
                </details>
              ) : null}
            </div>
          );
        }) : fallbackMessages.slice(-4).map((message, index) => (
          <div key={`${message}-${index}`} className="truncate">{message}</div>
        ))}
        {activities.length > 0 && rows.length === 0 ? <div>No activity matches this filter.</div> : null}
        {activities.length === 0 && fallbackMessages.length === 0 ? <div>No workflow events observed yet.</div> : null}
      </div>
    </div>
  );
};

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
