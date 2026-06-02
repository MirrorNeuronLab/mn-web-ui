import api from './client';
import { z } from 'zod';

export const AgentSchema = z.object({
  agent_id: z.string().optional().default('unknown'),
  alias: z.string().optional(),
  display_name: z.string().optional(),
  label: z.string().optional(),
  role: z.string().optional(),
  agent_type: z.string().optional().default('unknown'),
  type: z.string().optional().default('unknown'),
  assigned_node: z.string().optional().default('unassigned'),
  status: z.string().optional().default('unknown'),
  running: z.boolean().optional(),
  processed_messages: z.number().optional().default(0),
  mailbox_depth: z.number().optional().default(0),
  paused: z.boolean().optional(),
  metadata: z.object({
    outbound_edges: z.array(z.string()).optional(),
  }).optional(),
}).passthrough();

export const JobEventSchema = z.object({
  timestamp: z.string().optional().default('unknown'),
  type: z.string().optional().default('unknown'),
  agent_id: z.string().optional(),
  payload: z.any().optional(),
}).passthrough();

export const JobSchema = z.object({
  job_id: z.string().optional().default('unknown'),
  graph_id: z.string().optional().default('unknown'),
  status: z.string().optional().default('unknown'),
  submitted_at: z.string().optional(),
  updated_at: z.string().optional(),
  run_id: z.string().optional(),
  executor_count: z.number().optional(),
  active_executors: z.number().optional(),
  type: z.string().optional(),
  job_type: z.string().optional(),
  live: z.boolean().optional(),
  'live?': z.boolean().optional(),
  recovery_status: z.string().optional(),
  recovery_requires_review: z.boolean().optional(),
  recovery: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const JobDetailsSchema = z.object({
  job: JobSchema.optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
  agents: z.array(AgentSchema).optional().default([]),
  sandboxes: z.array(z.unknown()).optional().default([]),
  recent_events: z.array(JobEventSchema).optional().default([]),
  web_ui: z.record(z.string(), z.unknown()).optional(),
  web_ui_service: z.record(z.string(), z.unknown()).optional(),
  blueprint_web_ui_service: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const AgentGraphNodeSchema = z.object({
  id: z.string(),
  alias: z.string().optional(),
  display_name: z.string().optional(),
  label: z.string().optional(),
  role: z.string().optional(),
  agent_type: z.string().optional().default('unknown'),
  type: z.string().optional().default('unknown'),
  assigned_node: z.string().optional().default('unassigned'),
  status: z.string().optional().default('unknown'),
  processed_messages: z.number().optional().default(0),
  mailbox_depth: z.number().optional().default(0),
}).passthrough();

export const AgentGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  message_type: z.string().optional().default('message'),
  count: z.number().optional().default(0),
  last_seen_at: z.string().nullable().optional(),
  source_event: z.string().optional(),
}).passthrough();

export const AgentGraphSchema = z.object({
  job_id: z.string(),
  graph_id: z.string().nullable().optional(),
  status: z.string().optional().default('unknown'),
  nodes: z.array(AgentGraphNodeSchema).optional().default([]),
  edges: z.array(AgentGraphEdgeSchema).optional().default([]),
  stats: z.object({
    agent_count: z.number().optional().default(0),
    edge_count: z.number().optional().default(0),
    message_count: z.number().optional().default(0),
    event_count: z.number().optional().default(0),
  }).optional().default({ agent_count: 0, edge_count: 0, message_count: 0, event_count: 0 }),
}).passthrough();

export const SystemSummarySchema = z.object({
  nodes: z.array(z.object({
    name: z.string().optional().default('unknown'),
    connected_nodes: z.array(z.string()).optional().default([]),
    self: z.boolean().optional(),
    executor_pools: z.record(z.string(), z.object({
      capacity: z.number().optional().default(0),
      available: z.number().optional().default(0),
      in_use: z.number().optional().default(0),
      queued: z.number().optional().default(0),
      active: z.number().optional().default(0),
    })).optional().default({}),
  }).passthrough()).optional().default([]),
  jobs: z.array(z.object({
    job_id: z.string().optional().default('unknown'),
    status: z.string().optional().default('unknown'),
  }).passthrough()).optional().default([]),
}).passthrough();

export const ClusterNodeAddResponseSchema = z.object({
  ok: z.boolean().optional().default(true),
  host: z.string().optional().default(''),
  node_name: z.string().optional().default(''),
  status: z.string().optional().default('unknown'),
  message: z.string().optional().default(''),
}).passthrough();

export const ClusterNodeRemoveResponseSchema = z.object({
  ok: z.boolean().optional().default(true),
  node_name: z.string().optional().default(''),
  status: z.string().optional().default('unknown'),
  message: z.string().optional().default(''),
}).passthrough();

export const RunUiComponentSchema = z.object({
  type: z.string().optional().default('events'),
  label: z.string().optional(),
  source: z.string().optional(),
  event_types: z.array(z.string()).optional().default([]),
  max_events: z.number().optional(),
}).passthrough();

export const RunUiDefinitionSchema = z.object({
  schema_version: z.number().optional().default(1),
  adapter: z.string().optional().default('gradio'),
  kind: z.string().optional().default('output'),
  title: z.string().optional().default('Blueprint Run'),
  run_id: z.string().optional(),
  blueprint_id: z.string().optional(),
  events_path: z.string().optional(),
  refresh_seconds: z.number().optional().default(2),
  components: z.array(RunUiComponentSchema).optional().default([]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough();

export const WebUiHandleSchema = z.object({
  adapter: z.string().optional().default('gradio'),
  kind: z.string().optional().default('output'),
  url: z.string().optional().default(''),
  title: z.string().optional().default('Blueprint Run'),
  status: z.string().optional().default('unknown'),
  path: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough();

const DefaultWebUiHandle = WebUiHandleSchema.parse({});

export const RunUiResponseSchema = z.object({
  run_id: z.string(),
  run_dir: z.string().optional(),
  ui: RunUiDefinitionSchema,
  web_ui: WebUiHandleSchema.optional().default(DefaultWebUiHandle),
  job: z.record(z.string(), z.unknown()).optional().default({}),
  run: z.record(z.string(), z.unknown()).optional().default({}),
  events: z.array(JobEventSchema).optional().default([]),
}).passthrough();

export const BlueprintSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional().default(''),
  category: z.string().optional(),
  category_slug: z.string().optional(),
  path: z.string().optional(),
}).passthrough();

export const BlueprintListResponseSchema = z.object({
  repo_dir: z.string().optional(),
  blueprints: z.array(BlueprintSchema).optional().default([]),
  categories: z.array(z.record(z.string(), z.unknown())).optional().default([]),
}).passthrough();

export const BlueprintLaunchResponseSchema = z.object({
  id: z.string().optional(),
  job_id: z.string().optional(),
  run_id: z.string().optional().nullable(),
  status: z.string().optional().default('pending'),
  source: z.string().optional(),
  blueprint: BlueprintSchema.optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
  command: z.string().optional(),
}).passthrough();

export const WorkflowProgressAgentSchema = z.object({
  id: z.string().optional().default('unknown'),
  alias: z.string().optional(),
  display_name: z.string().optional(),
  role: z.string().optional().default('worker'),
  working_on: z.string().optional().default('worker'),
  model: z.string().optional().default('runtime'),
  assigned_node: z.string().optional(),
  status: z.string().optional().default('pending'),
  progress: z.number().optional().default(0),
  live: z.boolean().optional().default(false),
  mailbox_depth: z.number().nullable().optional(),
  tokens: z.number().nullable().optional(),
  tools: z.number().nullable().optional(),
  elapsed_seconds: z.number().optional().default(0),
  started_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  last_event_at: z.string().nullable().optional(),
}).passthrough();

export const WorkflowProgressStepSchema = z.object({
  id: z.string().optional().default('step'),
  label: z.string().optional().default('Step'),
  goal: z.string().optional().default(''),
  status: z.string().optional().default('pending'),
  current: z.boolean().optional().default(false),
  parents: z.array(z.string()).optional(),
  children: z.array(z.string()).optional(),
  layer: z.number().optional(),
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  done_count: z.number().optional().default(0),
  running_count: z.number().optional().default(0),
  idle_count: z.number().optional().default(0),
  ready_count: z.number().optional().default(0),
  failed_count: z.number().optional().default(0),
  total_count: z.number().optional().default(0),
  live: z.boolean().optional().default(false),
  elapsed_seconds: z.number().optional().default(0),
  started_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  last_event_at: z.string().nullable().optional(),
  agents: z.array(WorkflowProgressAgentSchema).optional().default([]),
}).passthrough();

export const WorkflowProgressSchema = z.object({
  schema_version: z.number().optional().default(1),
  job_id: z.string().optional().default('unknown'),
  workflow_id: z.string().optional().default('blueprint'),
  name: z.string().optional().default('Blueprint'),
  description: z.string().optional().default(''),
  status: z.string().optional().default('unknown'),
  workflow_kind: z.enum(['batch', 'service']).optional().default('batch'),
  generated_at: z.string().nullable().optional(),
  submitted_at: z.string().nullable().optional(),
  elapsed_seconds: z.number().optional().default(0),
  agent_count: z.object({
    done: z.number().optional().default(0),
    running: z.number().optional().default(0),
    idle: z.number().optional().default(0),
    ready: z.number().optional().default(0),
    failed: z.number().optional().default(0),
    total: z.number().optional().default(0),
  }).optional().default({ done: 0, running: 0, idle: 0, ready: 0, failed: 0, total: 0 }),
  current_step_id: z.string().nullable().optional(),
  current_step_ids: z.array(z.string()).optional(),
  current_step: WorkflowProgressStepSchema.nullable().optional(),
  steps: z.array(WorkflowProgressStepSchema).optional().default([]),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    event: z.string().optional(),
  }).passthrough()).optional(),
  layers: z.array(z.array(z.string())).optional(),
  messages: z.array(z.string()).optional().default([]),
  recent_events: z.array(JobEventSchema).optional().default([]),
}).passthrough();

export type Agent = z.infer<typeof AgentSchema>;
export type JobEvent = z.infer<typeof JobEventSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobDetails = z.infer<typeof JobDetailsSchema>;
export type AgentGraph = z.infer<typeof AgentGraphSchema>;
export type SystemSummary = z.infer<typeof SystemSummarySchema>;
export type ClusterNodeAddResponse = z.infer<typeof ClusterNodeAddResponseSchema>;
export type ClusterNodeRemoveResponse = z.infer<typeof ClusterNodeRemoveResponseSchema>;
export type RunUiComponent = z.infer<typeof RunUiComponentSchema>;
export type RunUiDefinition = z.infer<typeof RunUiDefinitionSchema>;
export type WebUiHandle = z.infer<typeof WebUiHandleSchema>;
export type RunUiResponse = z.infer<typeof RunUiResponseSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
export type BlueprintListResponse = z.infer<typeof BlueprintListResponseSchema>;
export type BlueprintLaunchResponse = z.infer<typeof BlueprintLaunchResponseSchema>;
export type WorkflowProgressAgent = z.infer<typeof WorkflowProgressAgentSchema>;
export type WorkflowProgressStep = z.infer<typeof WorkflowProgressStepSchema>;
export type WorkflowProgress = z.infer<typeof WorkflowProgressSchema>;

export const isServiceJob = (job: Partial<Job> | null | undefined, summary?: { type?: unknown; job_type?: unknown; stream_mode?: unknown; policies?: unknown }): boolean => {
  const summaryType = typeof summary?.job_type === 'string' ? summary.job_type : typeof summary?.type === 'string' ? summary.type : '';
  const jobType = job?.job_type || job?.type || '';
  const summaryStreamMode = typeof summary?.stream_mode === 'string' ? summary.stream_mode : '';
  const policies = summary?.policies && typeof summary.policies === 'object' && !Array.isArray(summary.policies) ? summary.policies as Record<string, unknown> : {};
  const policyStreamMode = typeof policies.stream_mode === 'string' ? policies.stream_mode : '';
  return [summaryType, jobType].some((value) => value.toLowerCase() === 'service')
    || [summaryStreamMode, policyStreamMode].some((value) => value.toLowerCase() === 'live');
};

const ACTIVE_LIST_STATUSES = new Set(['pending', 'scheduled', 'validated', 'running']);
const STALE_SERVICE_LIST_STATUSES = new Set(['paused', 'completed', 'unknown']);

const normalizedText = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const jobHasLiveSignal = (job: Job): boolean => Boolean(job.live || job['live?']);

const jobRecoveryStatus = (job: Job): string => {
  const recovery = job.recovery && typeof job.recovery === 'object' ? job.recovery : {};
  return normalizedText(job.recovery_status) || normalizedText(recovery.status);
};

const shouldRefreshListStatus = (job: Job): boolean => {
  const status = normalizedText(job.status);
  if (!isServiceJob(job) || !STALE_SERVICE_LIST_STATUSES.has(status)) return false;
  return status === 'paused' || jobHasLiveSignal(job) || Boolean(jobRecoveryStatus(job));
};

const listStatusFromProgress = (progress: WorkflowProgress): string | null => {
  const status = normalizedText(progress.status);
  if (progress.workflow_kind === 'service' && ACTIVE_LIST_STATUSES.has(status)) {
    return status;
  }
  return null;
};

const refreshJobListStatus = async (job: Job): Promise<Job> => {
  if (!shouldRefreshListStatus(job) || !job.job_id || job.job_id === 'unknown') return job;
  try {
    const response = await api.get(`/jobs/${encodeURIComponent(job.job_id)}/workflow-progress`);
    const parsed = WorkflowProgressSchema.safeParse(response.data);
    if (!parsed.success) return job;
    const status = listStatusFromProgress(parsed.data);
    return status ? { ...job, status } : job;
  } catch {
    return job;
  }
};

export const fetchSystemSummary = () => api.get('/system/summary').then(r => {
  const result = SystemSummarySchema.safeParse(r.data);
  if (!result.success) {
    console.error('SystemSummary validation failed:', result.error);
    return SystemSummarySchema.parse({}); // return default structured fallback
  }
  return result.data;
});

export const addClusterNode = (payload: { host: string; token: string }) => api.post('/system/cluster/nodes:add', payload).then(r => {
  const result = ClusterNodeAddResponseSchema.safeParse(r.data);
  if (!result.success) {
    console.error('addClusterNode validation failed:', result.error);
    return ClusterNodeAddResponseSchema.parse({});
  }
  return result.data;
});

export const removeClusterNode = (nodeName: string) => api.post('/system/cluster/nodes:remove', { node_name: nodeName }).then(r => {
  const result = ClusterNodeRemoveResponseSchema.safeParse(r.data);
  if (!result.success) {
    console.error('removeClusterNode validation failed:', result.error);
    return ClusterNodeRemoveResponseSchema.parse({ node_name: nodeName });
  }
  return result.data;
});

export const fetchJobs = async () => {
  const r = await api.get('/jobs');
  const data = r.data?.data || [];
  const result = z.array(JobSchema).safeParse(data);
  if (!result.success) {
    console.error('fetchJobs validation failed:', result.error);
    return [];
  }
  return Promise.all(result.data.map(refreshJobListStatus));
};

export const fetchJobDetails = (id: string) => api.get(`/jobs/${id}`).then(r => {
  const result = JobDetailsSchema.safeParse(r.data);
  if (!result.success) {
    console.error(`fetchJobDetails(${id}) validation failed:`, result.error);
    return JobDetailsSchema.parse({ job: { job_id: id, status: 'unknown' } }); 
  }
  return result.data;
});

export const fetchJobEvents = (id: string) => api.get(`/jobs/${id}/events`).then(r => {
  const data = r.data?.data || [];
  const result = z.array(JobEventSchema).safeParse(data);
  if (!result.success) {
    console.error(`fetchJobEvents(${id}) validation failed:`, result.error);
    return [];
  }
  return result.data;
});
export const fetchJobAgentGraph = (id: string) => api.get(`/jobs/${id}/agent-graph`).then(r => {
  const result = AgentGraphSchema.safeParse(r.data);
  if (!result.success) {
    console.error(`fetchJobAgentGraph(${id}) validation failed:`, result.error);
    return AgentGraphSchema.parse({ job_id: id, nodes: [], edges: [] });
  }
  return result.data;
});
export const fetchRunUi = (id: string) => api.get(`/runs/${encodeURIComponent(id)}/ui`).then(r => {
  const result = RunUiResponseSchema.safeParse(r.data);
  if (!result.success) {
    console.error(`fetchRunUi(${id}) validation failed:`, result.error);
    return RunUiResponseSchema.parse({ run_id: id, ui: { run_id: id, title: 'Blueprint Run' } });
  }
  return result.data;
});
export const fetchBlueprints = () => api.get('/blueprints').then(r => {
  const result = BlueprintListResponseSchema.safeParse(r.data);
  if (!result.success) {
    console.error('fetchBlueprints validation failed:', result.error);
    return BlueprintListResponseSchema.parse({});
  }
  return result.data;
});
export const fetchWorkflowProgress = (id: string) => api.get(`/jobs/${encodeURIComponent(id)}/workflow-progress`).then(r => {
  const result = WorkflowProgressSchema.safeParse(r.data);
  if (!result.success) {
    console.error(`fetchWorkflowProgress(${id}) validation failed:`, result.error);
    return WorkflowProgressSchema.parse({ job_id: id, workflow_id: id, name: id });
  }
  return result.data;
});

const apiBaseUrl = () => String(api.defaults.baseURL || '/api/v1').replace(/\/$/, '');
const authHeader = (): Record<string, string> => {
  const header = api.defaults.headers.common.Authorization;
  return typeof header === 'string' && header ? { Authorization: header } : {};
};
const workflowProgressStreamUrl = (id: string) => `${apiBaseUrl()}/jobs/${encodeURIComponent(id)}/workflow-progress/stream`;

export const streamWorkflowProgress = async (
  id: string,
  onSnapshot: (snapshot: WorkflowProgress) => void,
  signal?: AbortSignal,
) => {
  const response = await fetch(workflowProgressStreamUrl(id), {
    headers: authHeader(),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`workflow progress stream failed: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const eventName = chunk.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (eventName !== 'snapshot' || !data) continue;
      const parsed = WorkflowProgressSchema.safeParse(JSON.parse(data));
      if (parsed.success) {
        onSnapshot(parsed.data);
      } else {
        console.error(`streamWorkflowProgress(${id}) validation failed:`, parsed.error);
      }
    }
  }
};
export const clearJobs = () => api.post('/jobs:cleanup').then(r => r.data as { cleared_count: number });
export const cancelJob = (id: string) => api.post(`/jobs/${id}/cancel`).then(r => r.data);
export const reloadBundle = (bundle_id: string) => api.post(`/bundles/${bundle_id}/reload`).then(r => r.data);

export const pauseJob = (id: string) => api.post(`/jobs/${id}/pause`).then(r => r.data);
export const resumeJob = (id: string) => api.post(`/jobs/${id}/resume`).then(r => r.data);
export const uploadBundle = (file: File) => {
  const formData = new FormData();
  formData.append('bundle', file);
  return api.post('/bundles/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};
export const createJob = (payload: unknown) => api.post('/jobs', payload).then(r => r.data);
export const launchBlueprintJob = (payload: unknown) => api.post('/blueprints/launch/runs', payload).then(r => {
  const result = BlueprintLaunchResponseSchema.safeParse(r.data);
  if (!result.success) {
    console.error('launchBlueprintJob validation failed:', result.error);
    return BlueprintLaunchResponseSchema.parse(r.data || {});
  }
  return result.data;
});
