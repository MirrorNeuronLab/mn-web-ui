import { useState } from 'react';
import { Activity, Check, Circle, Clock3, Loader2, X } from 'lucide-react';
import type { JobDetails, WorkflowActivity, WorkflowProgress, WorkflowProgressAgent, WorkflowProgressStep } from '../api';
import { displayAgentName } from '../utils/agentGraph';
import { formatElapsed, workflowStepCounts } from '../utils/workflowProgress';
import { artifactsFromDetails } from '../utils/workflowResources';
// ProgressResource and openArtifactLocation were unused and removed
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
import WorkflowTopologyGraph from './WorkflowTopologyGraph';

type WorkflowProgressPanelProps = {
  progress: WorkflowProgress | null;
  status?: string;
  details?: JobDetails | null;
  showFailurePanel?: boolean;
  webUi?: unknown;
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
  const source = agent.progress_source || 'estimated';
  const inferred = !['explicit', 'items', 'complete'].includes(source);
  const percent = `${Math.round(Math.max(0, Math.min(1, agent.progress || 0)) * 100)}%${inferred ? ' est.' : ''}`;
  const parts = [percent];
  const legacyTokensAreBudget = Boolean(agent.token_budget && agent.tokens === agent.token_budget && !agent.tokens_used);
  if (agent.items_total) parts.push(`${agent.items_done || 0}/${agent.items_total} items`);
  if (agent.tokens_used && agent.token_budget) {
    parts.push(`${formatTokens(agent.tokens_used)}/${formatTokens(agent.token_budget)} tok`);
  } else if (agent.tokens_used || (agent.tokens && !legacyTokensAreBudget)) {
    parts.push(`${formatTokens(agent.tokens_used || agent.tokens || 0)} tok`);
  } else if (agent.token_budget) {
    parts.push(`${formatTokens(agent.token_budget)} tok budget`);
  }
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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const nestedId = (value: unknown) => {
  const record = isRecord(value) ? value : {};
  return firstString(record.id, record.step_id, record.stepId, record.node_id, record.nodeId, record.name, record.label);
};

const stepAssociationIds = (step: WorkflowProgressStep, index: number) => {
  const record = step as Record<string, unknown>;
  return uniqueStrings([
    firstString(step.id),
    firstString(record.step_id, record.stepId),
    firstString(record.workflow_step_id, record.workflowStepId),
    firstString(record.node_id, record.nodeId),
    firstString(record.phase, record.name, step.label),
    `step-${index + 1}`,
  ]);
};

const agentStepIds = (agent: WorkflowProgressAgent) => {
  const record = agent as Record<string, unknown>;
  return uniqueStrings([
    firstString(record.step_id, record.stepId),
    firstString(record.current_step_id, record.currentStepId),
    firstString(record.workflow_step_id, record.workflowStepId),
    firstString(record.phase_id, record.phaseId),
    firstString(record.stage_id, record.stageId),
    firstString(record.node_id, record.nodeId),
    nestedId(record.step),
    nestedId(record.current_step || record.currentStep),
    nestedId(record.workflow_step || record.workflowStep),
  ]);
};

const topLevelAgents = (progress: WorkflowProgress) => {
  const agents = (progress as unknown as { agents?: unknown }).agents;
  return Array.isArray(agents) ? agents.filter(isRecord) as unknown as WorkflowProgressAgent[] : [];
};

const stepMatchesId = (step: WorkflowProgressStep, index: number, id: string | null) => (
  Boolean(id && stepAssociationIds(step, index).includes(id))
);

const eventKey = (event: WorkflowActivity, index: number) => (
  `${event.timestamp || 'unknown'}-${event.type || 'event'}-${event.step_id || ''}-${event.agent_id || ''}-${index}`
);

// ProgressResourcesColumn removed

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
          <span className="whitespace-nowrap font-mono text-[11px] text-neutral-600" title={`Progress source: ${agent.progress_source || 'estimated'}`}>{formatProgress(agent)}</span>
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

const MonitorStat = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-medium text-neutral-500">{label}</div>
    <div className={`mt-0.5 truncate text-sm font-semibold ${tone || 'text-neutral-950'}`} title={String(value)}>{value}</div>
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

export function WorkflowProgressPanel({ progress, details, showFailurePanel = true }: WorkflowProgressPanelProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  if (!progress) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white font-mono text-xs text-neutral-500">
        Loading workflow progress...
      </div>
    );
  }

  const workflowAgents = topLevelAgents(progress);
  const currentStep = progress.current_step || progress.steps.find((step) => step.current) || progress.steps[0];
  const effectiveSelectedStepId = selectedStepId && progress.steps.some((step, index) => stepMatchesId(step, index, selectedStepId)) ? selectedStepId : null;
  const selectedStep = effectiveSelectedStepId
    ? progress.steps.find((step, index) => stepMatchesId(step, index, effectiveSelectedStepId)) || (currentStep?.id === effectiveSelectedStepId ? currentStep : undefined)
    : undefined;
  const currentStepIds = new Set(uniqueStrings([
    ...(progress.current_step_ids?.length ? progress.current_step_ids : []),
    progress.current_step_id || '',
    currentStep?.id || '',
    ...progress.steps.flatMap((step, index) => step.current ? stepAssociationIds(step, index) : []),
  ]));
  const activeSteps = currentStepIds.size
    ? progress.steps
        .filter((step, index) => stepAssociationIds(step, index).some((id) => currentStepIds.has(id)))
        .map((step) => currentStep?.id === step.id && (currentStep.agents || []).length ? currentStep : step)
    : (currentStep ? [currentStep] : []);
  const detailSteps = selectedStep ? [selectedStep] : activeSteps;
  const stepAgents = detailSteps.flatMap((step) => step.agents || []);
  const detailStepIds = new Set(detailSteps.flatMap((step, index) => stepAssociationIds(step, index)));
  const matchingWorkflowAgents = workflowAgents.filter((agent) => agentStepIds(agent).some((id) => detailStepIds.has(id)));
  const hasWorkflowAgentStepIds = workflowAgents.some((agent) => agentStepIds(agent).length > 0);
  const selectedStepsAreActive = detailSteps.some((step) => step.current || ['running', 'active'].includes(String(step.status || '').toLowerCase()));
  const agents = stepAgents.length
    ? stepAgents
    : matchingWorkflowAgents.length
      ? matchingWorkflowAgents
      : !hasWorkflowAgentStepIds && selectedStepsAreActive
        ? workflowAgents
        : [];
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
  const stepCounts = workflowStepCounts(progress);
  const serviceWorkflow = progress.workflow_kind === 'service';
  const workflowTotal = serviceWorkflow ? progress.agent_count.total : stepCounts.total;
  const workflowDone = serviceWorkflow ? progress.agent_count.done : stepCounts.done;
  const workflowRunning = serviceWorkflow ? progress.agent_count.running : stepCounts.running;
  const workflowFailed = serviceWorkflow ? progress.agent_count.failed : stepCounts.failed;
  const monitorActivity = primaryStep?.activity_summary
    || primaryStep?.status_reason
    || agents.find((agent) => agent.activity_summary)?.activity_summary
    || agents.find((agent) => agent.status_reason)?.status_reason
    || agents.find((agent) => agent.working_on)?.working_on
    || '';
  const workflowLabel = progress.name || progress.workflow_id || 'Workflow';
  const currentLabel = primaryStep?.label || progress.current_step_id || 'None';

  return (
    <div className="absolute inset-0 overflow-auto bg-white font-sans">
      <section className="min-w-0 p-3">
          <div className="mb-3 border-b border-neutral-200 pb-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-neutral-950">{workflowLabel}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                  <span>Current: <strong className="font-medium text-neutral-700">{currentLabel}</strong></span>
                  <span className={`capitalize ${statusTone(progress.status)}`}>{progress.status || 'unknown'}</span>
                  {progress.progress_source ? <span>Source: {progress.progress_source}</span> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <MonitorStat label="Done" value={`${workflowDone}/${workflowTotal}`} />
                <MonitorStat label="Running" value={workflowRunning} tone={workflowRunning ? 'text-sky-700' : undefined} />
                <MonitorStat label="Failed" value={workflowFailed} tone={workflowFailed ? 'text-red-700' : undefined} />
                <MonitorStat label="Elapsed" value={formatElapsed(progress.elapsed_seconds || 0)} />
              </div>
            </div>
            {monitorActivity ? (
              <div className="mt-2 truncate rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-600" title={monitorActivity}>
                {monitorActivity}
              </div>
            ) : null}
          </div>
          {showFailurePanel && visibleFailure ? (
            <div className="mb-3">
              <FailurePanel failure={visibleFailure} title={progress.failure ? 'Job Failure' : 'Step Failure'} artifacts={failureArtifacts} />
            </div>
          ) : null}
          <WorkflowTopologyGraph
            progress={progress}
            selectedStepId={effectiveSelectedStepId}
            onSelectStep={setSelectedStepId}
          />
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
                  Show active steps
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
                {agents.length ? agents.map((agent, index) => <AgentRow key={`${agent.id || 'agent'}-${index}`} agent={agent} />) : (
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
  );
}

export default WorkflowProgressPanel;
