import { Check, Circle, Clock3, Loader2, X } from 'lucide-react';
import type { WorkflowProgress, WorkflowProgressAgent, WorkflowProgressStep } from '../api';
import { displayAgentName } from '../utils/agentGraph';

type WorkflowProgressPanelProps = {
  progress: WorkflowProgress | null;
  status?: string;
};

const statusTone = (status: string | undefined) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'done', 'succeeded'].includes(normalized)) return 'text-emerald-700';
  if (['partial', 'skipped'].includes(normalized)) return 'text-amber-700';
  if (['failed', 'cancelled', 'error'].includes(normalized)) return 'text-red-700';
  if (['running', 'active'].includes(normalized)) return 'text-sky-700';
  if (['idle', 'ready'].includes(normalized)) return 'text-neutral-600';
  return 'text-neutral-500';
};

const StatusGlyph = ({ status, current }: { status?: string; current?: boolean }) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'done', 'succeeded'].includes(normalized)) return <Check className="h-4 w-4 text-emerald-700" />;
  if (['partial', 'skipped'].includes(normalized)) return <Circle className="h-4 w-4 text-amber-600" />;
  if (['failed', 'cancelled', 'error'].includes(normalized)) return <X className="h-4 w-4 text-red-700" />;
  if (current || ['running', 'active'].includes(normalized)) return <Loader2 className="h-4 w-4 animate-spin text-sky-700" />;
  if (['idle', 'ready'].includes(normalized)) return <Circle className="h-4 w-4 text-neutral-500" />;
  if (['pending', 'scheduled', 'validated', 'preparing'].includes(normalized)) return <Clock3 className="h-4 w-4 text-neutral-500" />;
  return <Circle className="h-4 w-4 text-neutral-400" />;
};

const formatElapsed = (seconds?: number) => {
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

const StepRow = ({ step, index, workflowKind, showLayer }: { step: WorkflowProgressStep; index: number; workflowKind: string; showLayer: boolean }) => {
  const count = workflowKind === 'service' ? (step.ready_count || step.done_count || 0) : (step.done_count || 0);
  return (
    <div
      className={`grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-sm ${
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
      <div className={`font-mono text-xs ${step.current ? 'text-neutral-200' : 'text-neutral-500'}`}>
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
      <td className="max-w-[280px] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusGlyph status={agent.status} current={agent.status === 'running'} />
          <span className="truncate font-mono text-sm font-medium text-neutral-950" title={agent.id}>{agentName}</span>
        </div>
      </td>
      <td className="w-[120px] px-4 py-3 text-sm">
        <span className={`capitalize ${statusTone(agent.status)}`}>{agent.status || 'unknown'}</span>
      </td>
      <td className="max-w-[360px] px-4 py-3 text-sm text-neutral-700">
        <div className="truncate">{agent.working_on || agent.role || 'worker'}</div>
      </td>
      <td className="max-w-[240px] px-4 py-3 text-sm text-neutral-600">
        <div className="truncate">{agent.model || 'runtime'}</div>
      </td>
      <td className="w-[240px] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full bg-neutral-950" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="whitespace-nowrap font-mono text-xs text-neutral-600">{formatProgress(agent)}</span>
        </div>
      </td>
    </tr>
  );
};

export function WorkflowProgressPanel({ progress, status }: WorkflowProgressPanelProps) {
  if (!progress) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-neutral-500">
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
  const headlineStatus = progress.status || status || 'unknown';
  const workflowKind = progress.workflow_kind || 'batch';
  const shownAgents = workflowKind === 'service'
    ? (progress.agent_count.ready || progress.agent_count.done || 0)
    : (progress.agent_count.done || 0);
  const showLayer = (progress.layers || []).length > 1 || progress.steps.some((step) => step.parents?.length || step.children?.length);

  return (
    <div className="absolute inset-0 overflow-auto bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-mono text-lg font-semibold text-neutral-950">{progress.workflow_id || progress.name}</h3>
            {progress.description ? <p className="mt-1 max-w-5xl text-sm text-neutral-500">{progress.description}</p> : null}
          </div>
          <div className={`whitespace-nowrap font-mono text-sm font-semibold ${statusTone(headlineStatus)}`}>
            {shownAgents}/{progress.agent_count.total} agents · {formatElapsed(progress.elapsed_seconds)} · {headlineStatus}
          </div>
        </div>
      </div>

      <div className="grid min-h-[480px] grid-cols-1 lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-neutral-200 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 text-sm font-semibold text-neutral-950">Steps</div>
          <div className="space-y-1">
            {progress.steps.map((step, index) => (
              <StepRow key={step.id || index} step={step} index={index} workflowKind={workflowKind} showLayer={showLayer} />
            ))}
          </div>
        </aside>

        <section className="min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-neutral-950">
                {activeSteps.length > 1 ? `${activeSteps.length} active steps` : (currentStep?.label || 'Agents')} · {agents.length} agents
              </div>
              {activeSteps.length > 1 ? (
                <div className="truncate text-xs text-neutral-500">{activeSteps.map((step) => step.label).join(' / ')}</div>
              ) : currentStep?.goal ? <div className="truncate text-xs text-neutral-500">{currentStep.goal}</div> : null}
            </div>
            <div className={`text-xs font-medium capitalize ${statusTone(currentStep?.status)}`}>{currentStep?.status || 'unknown'}</div>
          </div>

          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full min-w-[900px] table-fixed text-left">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Working on</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {agents.length ? agents.map((agent) => <AgentRow key={agent.id} agent={agent} />) : (
                  <tr>
                    <td className="px-4 py-8 text-sm text-neutral-500" colSpan={5}>No agents reported for this step yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
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
