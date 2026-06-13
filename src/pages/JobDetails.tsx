import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchJobDetails, fetchJobEvents, fetchJobAgentGraph, fetchRunUi, fetchWorkflowProgress, streamWorkflowProgress, cancelJob, pauseJob, resumeJob } from '../api';
import type { AgentGraph, ErrorEnvelope, JobDetails as JobDetailsType, JobEvent, WebUiHandle, WorkflowProgress } from '../api';
import { format } from 'date-fns';
import { PlayCircle, CheckCircle, XCircle, Clock, AlertCircle, Ban, PauseCircle, Play, Loader2, Network, MessageSquare, ExternalLink, List, Code2, FileText } from 'lucide-react';
import { WorkflowAgentGraph } from '../components/WorkflowAgentGraph';
import { WorkflowProgressPanel } from '../components/WorkflowProgressPanel';
import FailurePanel from '../components/FailurePanel';
import ObservabilitySummaryPanel, { type ObservabilityArtifactRef } from '../components/ObservabilitySummaryPanel';
import { confirmActionToast } from '../components/ui/confirm-toast';
import { Tooltip } from '../components/ui/tooltip';
import { buildDisplayGraph } from '../utils/agentGraph';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { cn } from '../lib/utils';
import { formatElapsed } from '../utils/workflowProgress';
import { buildOutputResources } from '../utils/workflowResources';
import { blueprintWebUiInfo, buildFallbackWorkflowProgress, webUiInfoFromRecord } from '../utils/jobDetailsView';

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <PlayCircle className="h-3.5 w-3.5 text-neutral-700" />;
    case 'completed': return <CheckCircle className="h-3.5 w-3.5 text-neutral-700" />;
    case 'failed': return <XCircle className="h-3.5 w-3.5 text-neutral-700" />;
    case 'pending': return <Clock className="h-3.5 w-3.5 text-neutral-700" />;
    case 'paused': return <PauseCircle className="h-3.5 w-3.5 text-neutral-700" />;
    case 'cancelled': return <Ban className="h-3.5 w-3.5 text-neutral-500" />;
    default: return <AlertCircle className="h-3.5 w-3.5 text-neutral-400" />;
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

const SummaryCard = ({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) => (
  <Card className="p-3">
    <div className="mb-2 text-neutral-400">{icon}</div>
    <div className="text-xl font-semibold leading-6 text-neutral-950">{value}</div>
    <div className="mt-0.5 text-[11px] font-medium leading-4 text-neutral-500">{label}</div>
  </Card>
);

const observabilitySummaryFrom = (
  details: JobDetailsType,
  progress: WorkflowProgress | null,
  summaryRecord: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const root = details as Record<string, unknown>;
  const candidates = [
    progress?.observability_summary,
    root.observability_summary,
    summaryRecord.observability_summary,
    details.job?.observability_summary,
  ];
  return candidates.find(isNonEmptyRecord);
};

const traceIdFrom = (
  details: JobDetailsType,
  progress: WorkflowProgress | null,
  summaryRecord: Record<string, unknown>,
  observabilitySummary?: Record<string, unknown>,
): string | undefined => (
  knownStringValue(
    progress?.trace_id,
    details.trace_id,
    details.job?.trace_id,
    summaryRecord.trace_id,
    observabilitySummary?.trace_id,
  )
);

const TERMINAL_STATUSES = new Set(['completed', 'done', 'finished', 'succeeded', 'success', 'failed', 'cancelled', 'canceled', 'error']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNonEmptyRecord = (value: unknown): value is Record<string, unknown> => (
  isRecord(value) && Object.keys(value).length > 0
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

const canonicalActionStatus = (response: unknown, fallback: string): string => {
  const rawStatus = isRecord(response) ? response.status : undefined;
  const status = normalizedStatus(rawStatus, fallback) || fallback;
  if (status === 'resumed') return 'running';
  if (status === 'canceled') return 'cancelled';
  return status;
};

const displayStatusFromSources = (
  actionStatus: string | null,
  progressStatus: unknown,
  jobStatus: unknown,
  graphStatus: unknown,
): string | undefined => {
  const progress = normalizedStatus(progressStatus);
  if (progress && isTerminalStatus(progress)) return progress;
  const action = normalizedStatus(actionStatus);
  if (action) return action;
  const job = normalizedStatus(jobStatus);
  if (job === 'paused') return job;
  return normalizedStatus(progress, job, graphStatus);
};

const formattedTimestamp = (...values: unknown[]): string | undefined => {
  const raw = knownStringValue(...values);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return format(parsed, 'PP p');
};

const isTerminalStatus = (status?: string): boolean => TERMINAL_STATUSES.has(String(status || '').toLowerCase());

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
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

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
    const timer = window.setTimeout(() => {
      setActionStatus(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id]);

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

  if (!details || !details.job) return <div className="p-5 text-sm text-neutral-500">Loading or Invalid Job...</div>;
  const webUi = blueprintWebUiInfo(details) || webUiInfoFromRecord(runWebUi);
  const jobId = knownStringValue(details.job.job_id, id) || id || 'job';
  const displayStatus = displayStatusFromSources(actionStatus, workflowProgress?.status, details.job.status, graph?.status);
  const graphId = knownStringValue(details.job.graph_id, workflowProgress?.workflow_id, graph?.graph_id);
  const submittedAt = formattedTimestamp(details.job.submitted_at, workflowProgress?.submitted_at);
  const displayWorkflowProgress = workflowProgress && displayStatus ? { ...workflowProgress, status: displayStatus } : workflowProgress;
  const displayGraph = buildDisplayGraph(graph, details.agents || [], jobId, graphId, displayStatus, displayWorkflowProgress);
  const displayAgents = displayGraph.nodes;
  const graphCode = JSON.stringify(displayGraph, null, 2);
  const progressOutputs = displayWorkflowProgress ? buildOutputResources(displayWorkflowProgress, details) : [];
  const detailRoot = details as Record<string, unknown>;
  const summaryRecord = isRecord(details.summary) ? details.summary : {};
  const summaryFailure = isRecord(summaryRecord.failure) ? summaryRecord.failure as ErrorEnvelope : undefined;
  const failure = displayWorkflowProgress?.failure || details.failure || details.job.failure || summaryFailure;
  const artifactRefs = [detailRoot.artifacts, detailRoot.output_files, details.job.artifacts]
    .find((candidate) => Array.isArray(candidate)) as ObservabilityArtifactRef[] | undefined;
  const observabilitySummary = observabilitySummaryFrom(details, displayWorkflowProgress || null, summaryRecord);
  const traceId = traceIdFrom(details, displayWorkflowProgress || null, summaryRecord, observabilitySummary);
  const liveAgentCount = displayWorkflowProgress
    ? displayWorkflowProgress.agent_count.running
    : displayGraph.nodes.filter((agent) => agent.status === 'running').length;
  const totalAgentCount = displayWorkflowProgress
    ? displayWorkflowProgress.agent_count.total
    : displayGraph.stats.agent_count;
  const eventCount = Math.max(
    displayWorkflowProgress?.recent_events?.length || 0,
    displayWorkflowProgress?.messages?.length || 0,
    displayGraph.stats.event_count || 0,
    displayGraph.stats.message_count || 0,
  );
  const runtime = formatElapsed(displayWorkflowProgress?.elapsed_seconds || 0);

  const confirmCancel = () => {
    confirmActionToast({
      id: `job-cancel-${jobId}`,
      title: 'Cancel this job?',
      description: 'This action stops the job and interrupts running agents attached to it.',
      confirmLabel: 'Cancel job',
      cancelLabel: 'Keep running',
      loading: {
        title: 'Cancelling job',
        description: jobId,
      },
      success: {
        title: 'Job cancelled',
        description: jobId,
      },
      error: {
        title: 'Cancel failed',
        description: `Failed to cancel ${jobId}.`,
      },
      onConfirm: async () => {
        setIsCancelling(true);
        try {
          await cancelJob(jobId);
          setIsCancelling(false);
          navigate('/jobs');
        } catch (err: unknown) {
          console.error('Failed to cancel job', err);
          setIsCancelling(false);
          throw err;
        }
      },
    });
  };

  const confirmPause = () => {
    confirmActionToast({
      id: `job-pause-${jobId}`,
      title: 'Pause this job?',
      description: 'The job will stop accepting work until it is resumed.',
      confirmLabel: 'Pause job',
      cancelLabel: 'Keep running',
      loading: {
        title: 'Pausing job',
        description: jobId,
      },
      success: {
        title: 'Job paused',
        description: jobId,
      },
      error: {
        title: 'Pause failed',
        description: `Failed to pause ${jobId}.`,
      },
      onConfirm: async () => {
        setIsPausing(true);
        try {
          const response = await pauseJob(jobId);
          setActionStatus(canonicalActionStatus(response, 'paused'));
          await load();
        } catch (err) {
          console.error('Failed to pause job', err);
          throw err;
        } finally {
          setIsPausing(false);
        }
      },
    });
  };

  const confirmResume = () => {
    confirmActionToast({
      id: `job-resume-${jobId}`,
      title: 'Resume this job?',
      description: 'The job will continue accepting work and processing queued agents.',
      confirmLabel: 'Resume job',
      cancelLabel: 'Keep paused',
      loading: {
        title: 'Resuming job',
        description: jobId,
      },
      success: {
        title: 'Job resumed',
        description: jobId,
      },
      error: {
        title: 'Resume failed',
        description: `Failed to resume ${jobId}.`,
      },
      onConfirm: async () => {
        setIsResuming(true);
        try {
          const response = await resumeJob(jobId);
          setActionStatus(canonicalActionStatus(response, 'running'));
          await load();
        } catch (err) {
          console.error('Failed to resume job', err);
          throw err;
        } finally {
          setIsResuming(false);
        }
      },
    });
  };

  const selectActiveTab = (value: 'progress' | 'agents' | 'logs') => {
    setActiveTab(value);
  };

  return (
    <div className="flex h-full flex-col space-y-4 font-sans">
      <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_560px]">
        <Card className="flex items-start justify-between p-4">
        <div>
          <div className="mb-2 flex items-center space-x-3">
            <h2 className="text-lg font-bold leading-6 text-neutral-950">{jobId}</h2>
            {displayStatus ? (
              <Badge variant="outline" className={cn('gap-1.5 capitalize', statusClass(displayStatus))}>
                <StatusIcon status={displayStatus} />
                {displayStatus}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-neutral-500">
            {graphId ? <span>Workflow: <strong className="text-neutral-700">{graphId}</strong></span> : null}
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
            <Tooltip content={webUi.status ? `${webUi.title} (${webUi.status})` : webUi.title}>
              <Button asChild size="sm">
                <a href={webUi.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Web UI
                </a>
              </Button>
            </Tooltip>
          ) : null}
          {displayStatus === 'running' ? (
            <Tooltip content="Pause this job after confirmation.">
              <span className="inline-flex">
                <Button type="button" variant="outline" size="sm" disabled={isPausing} onClick={confirmPause}>
                  {isPausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />} Pause
                </Button>
              </span>
            </Tooltip>
          ) : displayStatus === 'paused' ? (
            <Tooltip content="Resume this paused job after confirmation.">
              <span className="inline-flex">
                <Button type="button" variant="outline" size="sm" disabled={isResuming} onClick={confirmResume}>
                  {isResuming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Resume
                </Button>
              </span>
            </Tooltip>
          ) : null}
          {(displayStatus === 'running' || displayStatus === 'pending' || displayStatus === 'paused') ? (
            <Tooltip content="Cancel this job after confirmation. Running agents will stop.">
              <span className="inline-flex">
                <Button type="button" variant="outline" size="sm" disabled={isCancelling} onClick={confirmCancel}>
                  {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Cancel
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </div>
      </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Network className="h-3.5 w-3.5" />} value={`${liveAgentCount}/${totalAgentCount}`} label="Live Agents" />
          <SummaryCard icon={<FileText className="h-3.5 w-3.5" />} value={progressOutputs.length} label="Artifacts" />
          <SummaryCard icon={<MessageSquare className="h-3.5 w-3.5" />} value={eventCount} label="Events" />
          <SummaryCard icon={<Clock className="h-3.5 w-3.5" />} value={runtime} label="Runtime" />
        </div>
        <div className="space-y-3 xl:col-span-2">
          <FailurePanel failure={failure} title="Job Failure" artifacts={artifactRefs} />
          <ObservabilitySummaryPanel summary={observabilitySummary} traceId={traceId} artifacts={artifactRefs} />
        </div>
      </div>

      <Card className="flex min-h-[560px] flex-1 flex-col overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(value) => selectActiveTab(value as 'progress' | 'agents' | 'logs')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-neutral-200 bg-neutral-50 px-3">
            <TabsList className="h-auto rounded-none bg-transparent p-0">
              <TabsTrigger className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-3 data-[state=active]:border-neutral-950 data-[state=active]:bg-transparent data-[state=active]:shadow-none" value="progress" onClick={() => selectActiveTab('progress')}>Progress</TabsTrigger>
              <TabsTrigger className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-3 data-[state=active]:border-neutral-950 data-[state=active]:bg-transparent data-[state=active]:shadow-none" value="agents" onClick={() => selectActiveTab('agents')}>Agents</TabsTrigger>
              <TabsTrigger className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-3 data-[state=active]:border-neutral-950 data-[state=active]:bg-transparent data-[state=active]:shadow-none" value="logs" onClick={() => selectActiveTab('logs')}>Communication Logs</TabsTrigger>
            </TabsList>
          </div>

        <div className="relative flex-1">
          {activeTab === 'progress' && (
            <WorkflowProgressPanel
              progress={displayWorkflowProgress}
              details={details}
              webUi={webUi}
              showFailurePanel={!failure}
            />
          )}

          {activeTab === 'agents' && (
            <div className="absolute inset-0 flex flex-col bg-white">
              <div className="flex items-center justify-end border-b border-neutral-200 bg-white px-3 py-2">
                <div className="flex overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
                  <Tooltip content="Show agents in a scan-friendly table.">
                    <Button
                      type="button"
                      variant={agentView === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      aria-label="Show agents as list"
                      aria-pressed={agentView === 'list'}
                      onClick={() => setAgentView('list')}
                      className="rounded-none border-r border-neutral-200"
                    >
                      <List className="h-3.5 w-3.5" />
                      List
                    </Button>
                  </Tooltip>
                  <Tooltip content="Show agents as a workflow graph.">
                    <Button
                      type="button"
                      variant={agentView === 'graph' ? 'default' : 'ghost'}
                      size="sm"
                      aria-label="Show agents as graph"
                      aria-pressed={agentView === 'graph'}
                      onClick={() => setAgentView('graph')}
                      className="rounded-none border-r border-neutral-200"
                    >
                      <Network className="h-3.5 w-3.5" />
                      Graph
                    </Button>
                  </Tooltip>
                  <Tooltip content="Show the raw graph model as JSON.">
                    <Button
                      type="button"
                      variant={agentView === 'code' ? 'default' : 'ghost'}
                      size="sm"
                      aria-label="Show agents as code"
                      aria-pressed={agentView === 'code'}
                      onClick={() => setAgentView('code')}
                      className="rounded-none"
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Code
                    </Button>
                  </Tooltip>
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
                    progress={displayWorkflowProgress}
                  />
                ) : agentView === 'code' ? (
                  <div className="absolute inset-0 overflow-auto bg-neutral-950 p-3">
                    <pre className="font-mono text-[11px] leading-5 text-neutral-200">{graphCode}</pre>
                  </div>
                ) : (
                  <div className="overflow-auto absolute inset-0">
                    {displayAgents.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                        No agents reported yet.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader className="sticky top-0 bg-neutral-50">
                          <TableRow className="text-[11px] text-neutral-500">
                            <TableHead className="px-4 py-2">Agent ID</TableHead>
                            <TableHead className="px-4 py-2">Type</TableHead>
                            <TableHead className="px-4 py-2">Status</TableHead>
                            <TableHead className="px-4 py-2">Messages</TableHead>
                            <TableHead className="px-4 py-2">Node</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayAgents.map((agent, i) => (
                            <TableRow key={agent.id || i} className="hover:bg-neutral-50">
                              <TableCell className="px-4 py-2 font-mono text-xs font-medium text-neutral-950">{agent.label || agent.id || 'unknown'}</TableCell>
                              <TableCell className="px-4 py-2 text-xs text-neutral-600">{agent.agent_type || 'unknown'} / {agent.type || 'unknown'}</TableCell>
                              <TableCell className="px-4 py-2 text-xs">
                                <Badge variant="outline" className={cn('capitalize', statusClass(agent.status))}>{agent.status || 'unknown'}</Badge>
                              </TableCell>
                              <TableCell className="px-4 py-2 text-xs text-neutral-600">{agent.processed_messages ?? 0} processed, {agent.mailbox_depth ?? 0} in queue</TableCell>
                              <TableCell className="px-4 py-2 text-xs text-neutral-500">{agent.assigned_node || 'unassigned'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="absolute inset-0 overflow-auto bg-neutral-950 p-3 font-mono text-xs leading-5 text-neutral-300">
              {(events || []).slice().reverse().map((ev, i) => (
                <div key={i} className="mb-1">
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
        </Tabs>
      </Card>
    </div>
  );
}
