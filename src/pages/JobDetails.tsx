import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchJobDetails, fetchJobEvents, fetchJobAgentGraph, fetchRunUi, fetchWorkflowProgress, streamWorkflowProgress, cancelJob, pauseJob, resumeJob, isServiceJob } from '../api';
import type { AgentGraph, JobDetails as JobDetailsType, JobEvent, WebUiHandle, WorkflowProgress } from '../api';
import { format } from 'date-fns';
import { PlayCircle, CheckCircle, XCircle, Clock, AlertCircle, Ban, PauseCircle, Play, Loader2, Network, RadioTower, MessageSquare, ExternalLink, List, Code2 } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { WorkflowAgentGraph } from '../components/WorkflowAgentGraph';
import { WorkflowProgressPanel } from '../components/WorkflowProgressPanel';
import { buildDisplayGraph } from '../utils/agentGraph';

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <PlayCircle className="w-5 h-5 text-neutral-700" />;
    case 'completed': return <CheckCircle className="w-5 h-5 text-neutral-700" />;
    case 'failed': return <XCircle className="w-5 h-5 text-neutral-700" />;
    case 'pending': return <Clock className="w-5 h-5 text-neutral-700" />;
    case 'paused': return <PauseCircle className="w-5 h-5 text-neutral-700" />;
    case 'cancelled': return <Ban className="w-5 h-5 text-neutral-500" />;
    default: return <AlertCircle className="w-5 h-5 text-neutral-400" />;
  }
};

const statusClass = (status: string) => {
  switch (status) {
    case 'running': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'completed': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'failed':
    case 'error': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'paused': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    case 'pending': return 'bg-neutral-100 text-neutral-950 border-neutral-300';
    default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
  }
};

type WebUiInfo = {
  url: string;
  title: string;
  status?: string;
};

const TERMINAL_STATUSES = new Set(['completed', 'done', 'finished', 'succeeded', 'success', 'failed', 'cancelled', 'canceled', 'error']);
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

const knownStringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== 'unknown') return trimmed;
  }
  return undefined;
};

const normalizedStatus = (...values: unknown[]): string | undefined => {
  const value = knownStringValue(...values);
  return value ? value.toLowerCase() : undefined;
};

const formattedTimestamp = (...values: unknown[]): string | undefined => {
  const raw = knownStringValue(...values);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return format(parsed, 'PP p');
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

const isTerminalStatus = (status?: string): boolean => TERMINAL_STATUSES.has(String(status || '').toLowerCase());

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
  if (isTerminalStatus(status) || isTerminalStatus(jobStatus)) return 1;
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

const buildFallbackWorkflowProgress = (
  details: JobDetailsType,
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
  const doneCount = isTerminalStatus(jobStatus)
    ? agents.length
    : agents.filter((agent) => isTerminalStatus(agent.status)).length;
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
    status: isTerminalStatus(jobStatus) ? jobStatus : (jobStatus === 'running' ? 'running' : jobStatus || 'observed'),
    current: !isTerminalStatus(jobStatus),
    done_count: doneCount,
    running_count: runningCount,
    idle_count: idleCount,
    ready_count: readyCount,
    failed_count: failedCount,
    total_count: agents.length,
    live: workflowKind === 'service',
    elapsed_seconds: elapsedSecondsSince(submittedAt),
    started_at: submittedAt || null,
    ended_at: isTerminalStatus(jobStatus) ? (updatedAt || null) : null,
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

const webUiInfoFromRecord = (record: unknown): WebUiInfo | null => {
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

const blueprintWebUiInfo = (details: JobDetailsType): WebUiInfo | null => {
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

export default function JobDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<JobDetailsType | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [graph, setGraph] = useState<AgentGraph | null>(null);
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress | null>(null);
  const [runWebUi, setRunWebUi] = useState<WebUiHandle | null>(null);
  const [activeTab, setActiveTab] = useState<'progress' | 'agents' | 'logs'>('progress');
  const [agentView, setAgentView] = useState<'list' | 'graph' | 'code'>('list');
  
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, e, g, p] = await Promise.all([
        fetchJobDetails(id),
        fetchJobEvents(id).catch((err) => {
          console.error('Failed to load job events', err);
          return [] as JobEvent[];
        }),
        fetchJobAgentGraph(id).catch((err) => {
          console.error('Failed to load job agent graph', err);
          return {
            job_id: id,
            graph_id: null,
            status: 'unknown',
            nodes: [],
            edges: [],
            stats: { agent_count: 0, edge_count: 0, message_count: 0, event_count: 0 },
          } satisfies AgentGraph;
        }),
        fetchWorkflowProgress(id).catch((err) => {
          console.error('Failed to load workflow progress', err);
          return null;
        }),
      ]);
      setDetails(d);
      setEvents(e);
      setGraph(g);
      setWorkflowProgress(p || buildFallbackWorkflowProgress(d, e, g));
      const runId = stringValue(d.job?.run_id, isRecord(d.summary) ? d.summary.run_id : undefined);
      if (blueprintWebUiInfo(d) || !runId) {
        setRunWebUi(null);
      } else {
        const runUi = await fetchRunUi(runId).catch((err) => {
          console.error('Failed to load run web UI', err);
          return null;
        });
        setRunWebUi(runUi?.web_ui || null);
      }

    } catch (err) {
      console.error('Failed to load job details', err);
    }
  }, [id]);

  useEffect(() => {
    const initialLoad = setTimeout(load, 0);
    const timer = setInterval(load, 3000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let cancelled = false;
    streamWorkflowProgress(id, (snapshot) => {
      if (!cancelled) setWorkflowProgress(snapshot);
    }, controller.signal).catch((err) => {
      if (!cancelled && err?.name !== 'AbortError') {
        console.error('Workflow progress stream closed', err);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  if (!details || !details.job) return <div className="p-8">Loading or Invalid Job...</div>;
  const webUi = blueprintWebUiInfo(details) || webUiInfoFromRecord(runWebUi);
  const jobId = knownStringValue(details.job.job_id, id) || id || 'job';
  const displayStatus = normalizedStatus(details.job.status, workflowProgress?.status, graph?.status);
  const graphId = knownStringValue(details.job.graph_id, workflowProgress?.workflow_id, graph?.graph_id);
  const submittedAt = formattedTimestamp(details.job.submitted_at, workflowProgress?.submitted_at);
  const displayGraph = buildDisplayGraph(graph, details.agents || [], jobId, graphId, displayStatus, workflowProgress);
  const displayAgents = displayGraph.nodes;
  const graphCode = JSON.stringify(displayGraph, null, 2);

  const handleCancel = async () => {
    try {
      setCancelError(null);
      setIsCancelling(true);
      await cancelJob(id!);
      navigate('/jobs');
    } catch (err: unknown) {
      console.error('Failed to cancel job', err);
      const message = err instanceof Error ? err.message : 'Failed to cancel job';
      setCancelError(message);
      setIsCancelling(false);
    }
  };

  const handlePause = async () => {
    try {
      setIsPausing(true);
      await pauseJob(id!);
      await load();
    } catch (err) {
      console.error('Failed to pause job', err);
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    try {
      setIsResuming(true);
      await resumeJob(id!);
      await load();
    } catch (err) {
      console.error('Failed to resume job', err);
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 shrink-0">
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-6 flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <h2 className="text-xl font-bold font-mono text-neutral-950">{jobId}</h2>
            {displayStatus ? (
              <div className={`flex items-center px-3 py-1 rounded-full border ${statusClass(displayStatus)}`}>
                <StatusIcon status={displayStatus} />
                <span className="ml-2 text-sm font-medium capitalize">{displayStatus}</span>
              </div>
            ) : null}
          </div>
          <div className="text-neutral-500 text-sm flex flex-wrap gap-x-4 gap-y-2">
            {graphId ? <span>Graph: <strong className="text-neutral-700">{graphId}</strong></span> : null}
            {submittedAt ? <span>Submitted: <strong className="text-neutral-700">{submittedAt}</strong></span> : null}
            {webUi ? (
              <span>
                Web UI:{' '}
                <a className="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-950" href={webUi.url} target="_blank" rel="noreferrer">
                  {webUi.title}
                </a>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          {webUi ? (
            <a
              href={webUi.url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-neutral-950 text-white border border-neutral-950 rounded-md font-medium text-sm hover:bg-neutral-800 transition-colors flex items-center"
              title={webUi.status ? `${webUi.title} (${webUi.status})` : webUi.title}
            >
              <ExternalLink className="w-4 h-4 mr-2" /> Web UI
            </a>
          ) : null}
          {displayStatus === 'running' ? (
            <button disabled={isPausing} onClick={handlePause} className="px-4 py-2 bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-md font-medium text-sm hover:bg-neutral-50 transition-colors flex items-center disabled:opacity-50">
              {isPausing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PauseCircle className="w-4 h-4 mr-2" />} Pause
            </button>
          ) : displayStatus === 'paused' ? (
            <button disabled={isResuming} onClick={handleResume} className="px-4 py-2 bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-md font-medium text-sm hover:bg-neutral-50 transition-colors flex items-center disabled:opacity-50">
              {isResuming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />} Resume
            </button>
          ) : null}
          {(displayStatus === 'running' || displayStatus === 'pending' || displayStatus === 'paused') ? (
            <button disabled={isCancelling} onClick={() => setShowCancelConfirm(true)} className="px-4 py-2 bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-md font-medium text-sm hover:bg-neutral-50 transition-colors flex items-center disabled:opacity-50">
              {isCancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />} Cancel
            </button>
          ) : null}
        </div>
      </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <Network className="w-4 h-4 text-neutral-400 mb-3" />
            <div className="text-2xl font-semibold text-neutral-950">{displayGraph.stats.agent_count}</div>
            <div className="text-xs font-medium text-neutral-500">Agents</div>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <RadioTower className="w-4 h-4 text-neutral-400 mb-3" />
            <div className="text-2xl font-semibold text-neutral-950">{displayGraph.stats.edge_count}</div>
            <div className="text-xs font-medium text-neutral-500">Links</div>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-4 shadow-sm">
            <MessageSquare className="w-4 h-4 text-neutral-400 mb-3" />
            <div className="text-2xl font-semibold text-neutral-950">{displayGraph.stats.message_count}</div>
            <div className="text-xs font-medium text-neutral-500">Messages</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm flex-1 flex flex-col min-h-[560px] overflow-hidden">
        <div className="flex border-b border-neutral-200 bg-neutral-50 px-4">
          <button onClick={() => setActiveTab('progress')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'progress' ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'}`}>Progress</button>
          <button onClick={() => setActiveTab('agents')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'agents' ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'}`}>Agents</button>
          <button onClick={() => setActiveTab('logs')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'logs' ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'}`}>Communication Logs</button>
        </div>

        <div className="flex-1 relative">
          {activeTab === 'progress' && (
            <WorkflowProgressPanel
              progress={workflowProgress}
              status={displayStatus || 'unknown'}
            />
          )}

          {activeTab === 'agents' && (
            <div className="absolute inset-0 flex flex-col bg-white">
              <div className="flex items-center justify-end border-b border-neutral-200 bg-white px-4 py-3">
                <div className="flex overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
                  <button
                    type="button"
                    aria-label="Show agents as list"
                    aria-pressed={agentView === 'list'}
                    title="List view"
                    onClick={() => setAgentView('list')}
                    className={`flex h-9 items-center gap-2 border-r border-neutral-200 px-3 text-xs font-medium ${agentView === 'list' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
                  >
                    <List className="h-4 w-4" />
                    List
                  </button>
                  <button
                    type="button"
                    aria-label="Show agents as graph"
                    aria-pressed={agentView === 'graph'}
                    title="Graph view"
                    onClick={() => setAgentView('graph')}
                    className={`flex h-9 items-center gap-2 border-r border-neutral-200 px-3 text-xs font-medium ${agentView === 'graph' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
                  >
                    <Network className="h-4 w-4" />
                    Graph
                  </button>
                  <button
                    type="button"
                    aria-label="Show agents as code"
                    aria-pressed={agentView === 'code'}
                    title="Code view"
                    onClick={() => setAgentView('code')}
                    className={`flex h-9 items-center gap-2 px-3 text-xs font-medium ${agentView === 'code' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
                  >
                    <Code2 className="h-4 w-4" />
                    Code
                  </button>
                </div>
              </div>
              <div className="relative flex-1">
                {agentView === 'graph' ? (
                  <WorkflowAgentGraph
                    graph={graph}
                    agents={details.agents || []}
                    fallbackJobId={jobId}
                    fallbackGraphId={graphId}
                    fallbackStatus={displayStatus}
                    progress={workflowProgress}
                  />
                ) : agentView === 'code' ? (
                  <div className="absolute inset-0 overflow-auto bg-neutral-950 p-4">
                    <pre className="font-mono text-xs leading-5 text-neutral-200">{graphCode}</pre>
                  </div>
                ) : (
                  <div className="overflow-auto absolute inset-0">
                    {displayAgents.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                        No agents reported yet.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-neutral-50 sticky top-0">
                          <tr className="text-sm text-neutral-500">
                            <th className="px-6 py-3 font-medium">Agent ID</th>
                            <th className="px-6 py-3 font-medium">Type</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium">Messages</th>
                            <th className="px-6 py-3 font-medium">Node</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {displayAgents.map((agent, i) => (
                            <tr key={agent.id || i} className="hover:bg-neutral-50">
                              <td className="px-6 py-4 font-mono text-sm text-neutral-950 font-medium">{agent.label || agent.id || 'unknown'}</td>
                              <td className="px-6 py-4 text-sm text-neutral-600">{agent.agent_type || 'unknown'} / {agent.type || 'unknown'}</td>
                              <td className="px-6 py-4 text-sm">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusClass(agent.status)}`}>{agent.status || 'unknown'}</span>
                              </td>
                              <td className="px-6 py-4 text-sm text-neutral-600">{agent.processed_messages ?? 0} processed, {agent.mailbox_depth ?? 0} in queue</td>
                              <td className="px-6 py-4 text-sm text-neutral-500">{agent.assigned_node || 'unassigned'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="overflow-auto absolute inset-0 bg-neutral-950 text-neutral-300 font-mono text-sm p-4">
              {(events || []).slice().reverse().map((ev, i) => (
                <div key={i} className="mb-2">
                  <span className="text-neutral-500">{ev.timestamp ? format(new Date(ev.timestamp), 'HH:mm:ss.SSS') : 'unknown'}</span>{' '}
                  <span className="text-neutral-300">[{ev.type}]</span>{' '}
                  {ev.agent_id && <span className="text-neutral-300 font-bold">{ev.agent_id}</span>}{' '}
                  <span className="text-neutral-300">{ev.payload ? JSON.stringify(ev.payload) : ''}</span>
                </div>
              ))}
              {events.length === 0 && <div className="text-neutral-500 italic">No events recorded.</div>}
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={showCancelConfirm}
        title="Cancel Job"
        message="Are you sure you want to cancel this job? This action cannot be undone and will stop all running agents."
        confirmLabel="Cancel Job"
        onConfirm={handleCancel}
        onCancel={() => {
          setShowCancelConfirm(false);
          setCancelError(null);
        }}
        isProcessing={isCancelling}
        error={cancelError}
      />
    </div>
  );
}
