import { isServiceJob } from '../api';
import type { AgentGraph, JobDetails, JobEvent, WorkflowProgress } from '../api';
import { isTerminalJobStatus } from './jobStatus';

export type WebUiInfo = {
  url: string;
  title: string;
  status?: string;
};

const ACTIVE_EVENT_TYPES = new Set(['agent_message_received', 'executor_lease_acquired', 'route_selected', 'video_frame_tick_generated']);
const COMPLETE_EVENT_TYPES = new Set(['sandbox_job_completed', 'executor_lease_released']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const stringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const numericValue = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
};

const elapsedSecondsSince = (timestamp?: string): number => {
  if (!timestamp) return 0;
  const submitted = Date.parse(timestamp);
  if (!Number.isFinite(submitted)) return 0;
  return Math.max(0, Math.round((Date.now() - submitted) / 1000));
};

const eventStatus = (event: JobEvent | undefined, fallback: string): string => {
  const type = String(event?.type || '').toLowerCase();
  if (type.includes('failed') || type.includes('error')) return 'failed';
  if (ACTIVE_EVENT_TYPES.has(type)) return 'running';
  if (COMPLETE_EVENT_TYPES.has(type)) return 'completed';
  return fallback || 'observed';
};

const fallbackEventStatus = (event: JobEvent | undefined, fallback: string, workflowKind: string, live: boolean): string => {
  const type = String(event?.type || '').toLowerCase();
  if (type.includes('failed') || type.includes('error')) return 'failed';
  if (workflowKind === 'service' && live && COMPLETE_EVENT_TYPES.has(type)) return 'idle';
  if (workflowKind === 'service' && live && type === 'video_watch_frame_observed') return 'idle';
  return eventStatus(event, fallback);
};

const progressForStatus = (status: string, jobStatus: string): number => {
  if (isTerminalJobStatus(status) || isTerminalJobStatus(jobStatus)) return 1;
  if (String(status || '').toLowerCase() === 'idle') return 0.1;
  if (['running', 'active', 'ready', 'observed'].includes(String(status || '').toLowerCase())) return 0.45;
  return 0;
};

const humanize = (value: string): string => value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

const lastEventsByAgent = (events: JobEvent[]): Map<string, JobEvent> => {
  const byAgent = new Map<string, JobEvent>();
  for (const event of events) {
    if (event.agent_id) byAgent.set(event.agent_id, event);
  }
  return byAgent;
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

export const buildFallbackWorkflowProgress = (
  details: JobDetails,
  events: JobEvent[],
  graph: AgentGraph | null,
): WorkflowProgress => {
  const jobRecord = (details.job || {}) as Record<string, unknown>;
  const jobId = stringValue(jobRecord.job_id) || 'unknown';
  const jobStatus = stringValue(jobRecord.status) || 'unknown';
  const submittedAt = stringValue(jobRecord.submitted_at);
  const updatedAt = stringValue(jobRecord.updated_at);
  const summary = isRecord(details.summary) ? details.summary : {};
  const workflowKind = isServiceJob(details.job, summary) ? 'service' : 'batch';
  const recentEvents = [...(details.recent_events || []), ...(events || [])];
  const latestByAgent = lastEventsByAgent(recentEvents);
  const graphNodesById = new Map((graph?.nodes || []).map((node) => [node.id, node]));
  const graphAgents = (graph?.nodes || []).filter((node) => node.id !== 'runtime');
  const sourceAgents: Record<string, unknown>[] = (details.agents && details.agents.length > 0 ? details.agents : graphAgents).map((agent): Record<string, unknown> => {
    const record = agent as Record<string, unknown>;
    const id = stringValue(record.agent_id, record.id, record.label) || 'agent';
    const graphNode = graphNodesById.get(id) as Record<string, unknown> | undefined;
    return { ...graphNode, ...record, id };
  });
  const agents = sourceAgents.map((agent, index) => {
    const id = stringValue(agent.agent_id, agent.id, agent.label) || `agent-${index + 1}`;
    const latest = latestByAgent.get(id);
    const baseStatus = stringValue(agent.status) || 'observed';
    const live = Boolean(agent.live || agent['live?'] || ['stream', 'module', 'executor'].includes(String(agent.type || agent.agent_type || '').toLowerCase()));
    const status = fallbackEventStatus(latest, baseStatus, workflowKind, live);
    const payloadType = isRecord(latest?.payload) ? stringValue(latest?.payload.type) : undefined;
    const agentType = stringValue(agent.agent_type, agent.type) || 'worker';
    const workingOn = stringValue(
      payloadType ? humanize(payloadType) : undefined,
      latest?.type ? humanize(latest.type) : undefined,
      agent.alias,
      agent.display_name,
      agent.label,
      agentType,
    ) || 'worker';
    return {
      id,
      alias: stringValue(agent.alias),
      display_name: stringValue(agent.display_name),
      role: agentType,
      working_on: workingOn,
      model: stringValue(agent.assigned_node, agent.node, agent.model) || 'runtime',
      assigned_node: stringValue(agent.assigned_node, agent.node),
      status,
      progress: progressForStatus(status, jobStatus),
      live,
      tokens: null,
      tools: numericValue(agent.processed_messages),
      mailbox_depth: numericValue(agent.mailbox_depth),
      elapsed_seconds: 0,
      started_at: null,
      ended_at: null,
    };
  });
  const doneCount = isTerminalJobStatus(jobStatus)
    ? agents.length
    : agents.filter((agent) => isTerminalJobStatus(agent.status)).length;
  const runningCount = agents.filter((agent) => agent.status === 'running').length;
  const idleCount = agents.filter((agent) => agent.status === 'idle').length;
  const failedCount = agents.filter((agent) => ['failed', 'cancelled', 'error'].includes(agent.status)).length;
  const readyCount = agents.filter((agent) => ['done', 'completed', 'succeeded', 'success', 'idle', 'running', 'ready'].includes(agent.status)).length;
  const workflowId = stringValue(graph?.graph_id, jobRecord.graph_id, jobRecord.run_id, jobId) || 'runtime';
  const description = stringValue(
    summary.description,
    summary.title,
    'Showing runtime job status while detailed workflow progress is unavailable.',
  ) || '';
  const step = {
    id: 'runtime-agents',
    label: 'Runtime Agents',
    goal: 'Live job and agent status from the current API.',
    status: isTerminalJobStatus(jobStatus) ? jobStatus : (jobStatus === 'running' ? 'running' : jobStatus || 'observed'),
    current: !isTerminalJobStatus(jobStatus),
    done_count: doneCount,
    running_count: runningCount,
    idle_count: idleCount,
    ready_count: readyCount,
    failed_count: failedCount,
    total_count: agents.length,
    live: workflowKind === 'service',
    elapsed_seconds: elapsedSecondsSince(submittedAt),
    started_at: submittedAt || null,
    ended_at: isTerminalJobStatus(jobStatus) ? (updatedAt || null) : null,
    agents,
  };
  const recentMessages = recentEvents.slice(-4).map((event) => (
    `Observing: ${event.agent_id ? `${event.agent_id} ` : ''}${humanize(event.type || 'event')}`
  ));
  return {
    schema_version: 1,
    job_id: jobId,
    workflow_id: workflowId,
    name: workflowId,
    description,
    status: jobStatus,
    workflow_kind: workflowKind,
    generated_at: new Date().toISOString(),
    submitted_at: submittedAt || null,
    elapsed_seconds: elapsedSecondsSince(submittedAt),
    agent_count: { done: doneCount, running: runningCount, idle: idleCount, ready: readyCount, failed: failedCount, total: agents.length },
    current_step_id: step.id,
    current_step: step,
    steps: [step],
    messages: ['Showing runtime job status while detailed workflow progress is unavailable.', ...recentMessages],
    recent_events: recentEvents.slice(-20),
  };
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
