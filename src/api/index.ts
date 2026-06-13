import api from './client';
import { z } from 'zod';
import { parseArrayOrEmpty, parseOrFallback } from './parsing';
import { apiPathFromUrl, bundlePath, jobPath, launchProgressPath, modelPath, runPath } from './routes';
import { createWorkflowProgressStreamer } from './streaming';

export const ErrorEnvelopeSchema = z.object({
  schema_version: z.string().optional().default('mn.error.v1'),
  code: z.string().optional().default('runtime.failure'),
  desc: z.string().optional().default('Runtime failure'),
  details: z.record(z.string(), z.unknown()).optional().default({}),
  severity: z.string().optional().default('ERROR'),
  occurred_at: z.string().optional(),
  event_id: z.string().optional(),
  trace_id: z.string().nullable().optional(),
  span_id: z.string().nullable().optional(),
  remediation: z.string().optional(),
  links: z.array(z.object({
    rel: z.string().optional(),
    artifact_id: z.string().optional(),
    url: z.string().optional(),
  }).passthrough()).optional().default([]),
}).passthrough();

export const ObservabilitySummarySchema = z.record(z.string(), z.unknown()).optional();

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
  failure: ErrorEnvelopeSchema.optional().nullable(),
  metadata: z.object({
    outbound_edges: z.array(z.string()).optional(),
  }).optional(),
}).passthrough();

export const JobEventSchema = z.object({
  timestamp: z.string().optional().default('unknown'),
  type: z.string().optional().default('unknown'),
  agent_id: z.string().optional(),
  payload: z.any().optional(),
  error: ErrorEnvelopeSchema.optional(),
  failure: ErrorEnvelopeSchema.optional(),
}).passthrough();

export const JobSchema = z.object({
  job_id: z.string().optional().default('unknown'),
  graph_id: z.string().nullable().optional().default('unknown'),
  status: z.string().optional().default('unknown'),
  submitted_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),
  trace_id: z.string().nullable().optional(),
  executor_count: z.number().optional(),
  active_executors: z.number().optional(),
  type: z.string().optional(),
  job_type: z.string().optional(),
  live: z.boolean().optional(),
  'live?': z.boolean().optional(),
  recovery_status: z.string().nullable().optional(),
  recovery_requires_review: z.boolean().optional(),
  recovery: z.record(z.string(), z.unknown()).optional(),
  failure: ErrorEnvelopeSchema.optional(),
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
  trace_id: z.string().nullable().optional(),
  observability_summary: ObservabilitySummarySchema,
  failure: ErrorEnvelopeSchema.optional().nullable(),
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

export const RuntimeModelCompatibilitySchema = z.object({
  status: z.string().optional().default('unknown'),
  ok: z.boolean().optional().default(false),
  message: z.string().optional().default(''),
  warnings: z.array(z.string()).optional().default([]),
}).passthrough().nullable();

export const RuntimeModelSchema = z.object({
  id: z.string().optional().default('unknown'),
  name: z.string().optional().default('Runtime model'),
  provider: z.string().optional().default('docker_model_runner'),
  model: z.string().optional().default('unknown'),
  docker_model: z.string().optional().default('unknown'),
  api_model: z.string().optional(),
  backend: z.string().optional().default('unknown'),
  installed: z.boolean().optional().default(true),
  node: z.string().optional().default('local'),
  nodes: z.array(z.string()).optional().default([]),
  used_by: z.array(z.string()).optional().default([]),
  owner_count: z.number().optional().default(0),
  orphaned: z.boolean().optional().default(false),
  manual: z.boolean().optional().default(false),
  compatibility: RuntimeModelCompatibilitySchema.optional().default(null),
}).passthrough();

export const RuntimeModelListResponseSchema = z.object({
  models: z.array(RuntimeModelSchema).optional().default([]),
  node: z.string().optional().default('local'),
  runner_available: z.boolean().optional().default(false),
  warnings: z.array(z.string()).optional().default([]),
}).passthrough();

export const RuntimeModelBenchmarkSchema = z.object({
  model: z.string().optional().default('unknown'),
  name: z.string().optional().default('Runtime model'),
  docker_model: z.string().optional().default('unknown'),
  api_model: z.string().optional(),
  node: z.string().optional().default('local'),
  elapsed_ms: z.number().optional().default(0),
  first_token_ms: z.number().nullable().optional(),
  generated_tokens: z.number().optional().default(0),
  tokens_per_second: z.number().optional().default(0),
  sample: z.string().optional().default(''),
  estimated: z.boolean().optional().default(true),
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
  model_install: z.record(z.string(), z.unknown()).optional(),
  progress_id: z.string().optional().nullable(),
  command: z.string().optional(),
}).passthrough();

export const UploadedBundleSchema = z.object({
  bundle_path: z.string().optional().default(''),
  manifest: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough();

export const JobActionResponseSchema = z.object({
  ok: z.boolean().optional(),
  job_id: z.string().optional(),
  status: z.string().optional().default('unknown'),
  message: z.string().optional(),
}).passthrough();

export const ClearJobsResponseSchema = z.object({
  cleared_count: z.number().optional().default(0),
}).passthrough();

export const ReloadBundleResponseSchema = z.object({
  ok: z.boolean().optional(),
  status: z.string().optional(),
  message: z.string().optional(),
}).passthrough();

export const RevealArtifactResponseSchema = z.object({
  ok: z.boolean().optional(),
  path: z.string().optional(),
  folder: z.string().optional(),
  message: z.string().optional(),
}).passthrough();

export const LaunchProgressEventSchema = z.object({
  ts: z.string().optional(),
  phase: z.string().optional().default('launch'),
  status: z.string().optional().default('pending'),
  message: z.string().optional().default(''),
  details: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const LaunchProgressResponseSchema = z.object({
  progress_id: z.string(),
  events: z.array(LaunchProgressEventSchema).optional().default([]),
  latest: LaunchProgressEventSchema.nullable().optional(),
  completed: z.boolean().optional().default(false),
}).passthrough();

export const WorkflowActivitySchema = z.object({
  timestamp: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  step_id: z.string().optional(),
  agent_id: z.string().optional(),
  status: z.string().optional(),
  message: z.string().optional(),
  tool_name: z.string().optional(),
  target: z.string().optional(),
  duration_ms: z.number().optional(),
  result_summary: z.string().optional(),
  details: z.unknown().optional(),
  payload: z.unknown().optional(),
  failure: ErrorEnvelopeSchema.optional(),
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
  retry_at: z.string().nullable().optional(),
  deadline_at: z.string().nullable().optional(),
  heartbeat_deadline_at: z.string().nullable().optional(),
  attempt: z.number().nullable().optional(),
  attempt_id: z.string().nullable().optional(),
  status_reason: z.string().nullable().optional(),
  failure: ErrorEnvelopeSchema.nullable().optional(),
  activity_summary: z.string().optional(),
  last_activity: WorkflowActivitySchema.nullable().optional(),
  recent_events: z.array(WorkflowActivitySchema).optional(),
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
  retry_at: z.string().nullable().optional(),
  deadline_at: z.string().nullable().optional(),
  heartbeat_deadline_at: z.string().nullable().optional(),
  attempt: z.number().nullable().optional(),
  attempt_id: z.string().nullable().optional(),
  status_reason: z.string().nullable().optional(),
  failure: ErrorEnvelopeSchema.nullable().optional(),
  activity_summary: z.string().optional(),
  last_activity: WorkflowActivitySchema.nullable().optional(),
  recent_events: z.array(WorkflowActivitySchema).optional(),
  agents: z.array(WorkflowProgressAgentSchema).optional().default([]),
}).passthrough();

export const WorkflowProgressSchema = z.object({
  schema_version: z.number().optional().default(1),
  job_id: z.string().optional().default('unknown'),
  workflow_id: z.string().optional().default('blueprint'),
  name: z.string().optional().default('Blueprint'),
  description: z.string().optional().default(''),
  status: z.string().optional().default('unknown'),
  trace_id: z.string().nullable().optional(),
  workflow_kind: z.enum(['batch', 'service']).optional().default('batch'),
  failure: ErrorEnvelopeSchema.nullable().optional(),
  observability_summary: ObservabilitySummarySchema,
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
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;
export type JobEvent = z.infer<typeof JobEventSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobDetails = z.infer<typeof JobDetailsSchema>;
export type AgentGraph = z.infer<typeof AgentGraphSchema>;
export type SystemSummary = z.infer<typeof SystemSummarySchema>;
export type RuntimeModel = z.infer<typeof RuntimeModelSchema>;
export type RuntimeModelListResponse = z.infer<typeof RuntimeModelListResponseSchema>;
export type RuntimeModelBenchmark = z.infer<typeof RuntimeModelBenchmarkSchema>;
export type ClusterNodeAddResponse = z.infer<typeof ClusterNodeAddResponseSchema>;
export type ClusterNodeRemoveResponse = z.infer<typeof ClusterNodeRemoveResponseSchema>;
export type RunUiComponent = z.infer<typeof RunUiComponentSchema>;
export type RunUiDefinition = z.infer<typeof RunUiDefinitionSchema>;
export type WebUiHandle = z.infer<typeof WebUiHandleSchema>;
export type RunUiResponse = z.infer<typeof RunUiResponseSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
export type BlueprintListResponse = z.infer<typeof BlueprintListResponseSchema>;
export type BlueprintLaunchResponse = z.infer<typeof BlueprintLaunchResponseSchema>;
export type UploadedBundle = z.infer<typeof UploadedBundleSchema>;
export type JobActionResponse = z.infer<typeof JobActionResponseSchema>;
export type ClearJobsResponse = z.infer<typeof ClearJobsResponseSchema>;
export type ReloadBundleResponse = z.infer<typeof ReloadBundleResponseSchema>;
export type RevealArtifactResponse = z.infer<typeof RevealArtifactResponseSchema>;
export type LaunchProgressEvent = z.infer<typeof LaunchProgressEventSchema>;
export type LaunchProgressResponse = z.infer<typeof LaunchProgressResponseSchema>;
export type WorkflowActivity = z.infer<typeof WorkflowActivitySchema>;
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

const normalizedText = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const shouldRefreshListStatus = (job: Job): boolean => {
  return Boolean(job.job_id && job.job_id !== 'unknown');
};

const listStatusFromProgress = (progress: WorkflowProgress): string | null => {
  const status = normalizedText(progress.status);
  return status && status !== 'unknown' ? status : null;
};

const refreshJobListStatus = async (job: Job): Promise<Job> => {
  if (!shouldRefreshListStatus(job) || !job.job_id || job.job_id === 'unknown') return job;
  try {
    const response = await api.get(jobPath(job.job_id, '/workflow-progress'));
    const parsed = WorkflowProgressSchema.safeParse(response.data);
    if (!parsed.success) return job;
    const status = listStatusFromProgress(parsed.data);
    return status ? { ...job, status } : job;
  } catch {
    return job;
  }
};

export const fetchSystemSummary = () => api.get('/system/summary').then(r => (
  parseOrFallback(SystemSummarySchema, r.data, {}, 'SystemSummary')
));

export const fetchRuntimeModels = () => api.get('/models').then(r => (
  parseOrFallback(RuntimeModelListResponseSchema, r.data, {}, 'fetchRuntimeModels')
));

export const benchmarkRuntimeModel = (model: string, payload: { prompt?: string; max_tokens?: number } = {}) => (
  api.post(modelPath(model, '/benchmark'), payload).then(r => (
    parseOrFallback(RuntimeModelBenchmarkSchema, r.data, { model }, `benchmarkRuntimeModel(${model})`)
  ))
);

export const addClusterNode = (payload: { host: string; token: string }) => api.post('/system/cluster/nodes:add', payload).then(r => (
  parseOrFallback(ClusterNodeAddResponseSchema, r.data, {}, 'addClusterNode')
));

export const removeClusterNode = (nodeName: string) => api.post('/system/cluster/nodes:remove', { node_name: nodeName }).then(r => (
  parseOrFallback(ClusterNodeRemoveResponseSchema, r.data, { node_name: nodeName }, 'removeClusterNode')
));

export type FetchJobsOptions = {
  includeTerminal?: boolean;
};

export const fetchJobs = async (options: FetchJobsOptions = {}) => {
  const request =
    typeof options.includeTerminal === 'boolean'
      ? api.get('/jobs', { params: { include_terminal: options.includeTerminal } })
      : api.get('/jobs');
  const r = await request;
  const data = r.data?.data || [];
  const jobs = parseArrayOrEmpty(JobSchema, data, 'fetchJobs');
  return Promise.all(jobs.map(refreshJobListStatus));
};

export const fetchJobDetails = (id: string) => api.get(jobPath(id)).then(r => (
  parseOrFallback(JobDetailsSchema, r.data, { job: { job_id: id, status: 'unknown' } }, `fetchJobDetails(${id})`)
));

export const fetchJobEvents = (id: string) => api.get(jobPath(id, '/events')).then(r => (
  parseArrayOrEmpty(JobEventSchema, r.data?.data || [], `fetchJobEvents(${id})`)
));
export const fetchJobAgentGraph = (id: string) => api.get(jobPath(id, '/agent-graph')).then(r => (
  parseOrFallback(AgentGraphSchema, r.data, { job_id: id, nodes: [], edges: [] }, `fetchJobAgentGraph(${id})`)
));
export const fetchRunUi = (id: string) => api.get(runPath(id, '/ui')).then(r => (
  parseOrFallback(RunUiResponseSchema, r.data, { run_id: id, ui: { run_id: id, title: 'Blueprint Run' } }, `fetchRunUi(${id})`)
));
export const fetchBlueprints = () => api.get('/blueprints').then(r => (
  parseOrFallback(BlueprintListResponseSchema, r.data, {}, 'fetchBlueprints')
));
export const fetchWorkflowProgress = (id: string) => api.get(jobPath(id, '/workflow-progress')).then(r => (
  parseOrFallback(WorkflowProgressSchema, r.data, { job_id: id, workflow_id: id, name: id }, `fetchWorkflowProgress(${id})`)
));

const apiBaseUrl = () => String(api.defaults.baseURL || '/api/v1').replace(/\/$/, '');
const authHeader = (): Record<string, string> => {
  const header = api.defaults.headers.common.Authorization;
  return typeof header === 'string' && header ? { Authorization: header } : {};
};
const workflowProgressStreamUrl = (id: string) => `${apiBaseUrl()}${jobPath(id, '/workflow-progress/stream')}`;

export const revealArtifact = (revealUrl: string) => {
  let path: string;
  try {
    path = apiPathFromUrl(revealUrl, apiBaseUrl());
  } catch (error) {
    return Promise.reject(error);
  }
  return api.post(path).then(r => (
    parseOrFallback(RevealArtifactResponseSchema, r.data, {}, 'revealArtifact')
  ));
};

export const streamWorkflowProgress = createWorkflowProgressStreamer({
  schema: WorkflowProgressSchema,
  streamUrl: workflowProgressStreamUrl,
  authHeader,
  validationLabel: (id) => `streamWorkflowProgress(${id})`,
});
export const clearJobs = () => api.post('/jobs/cleanup').then(r => (
  parseOrFallback(ClearJobsResponseSchema, r.data, {}, 'clearJobs')
));
export const cancelJob = (id: string) => api.post(jobPath(id, '/cancel')).then(r => (
  parseOrFallback(JobActionResponseSchema, r.data, { job_id: id, status: 'cancelled' }, `cancelJob(${id})`)
));
export const reloadBundle = (bundle_id: string) => api.post(bundlePath(bundle_id, '/reload')).then(r => (
  parseOrFallback(ReloadBundleResponseSchema, r.data, {}, `reloadBundle(${bundle_id})`)
));

export const pauseJob = (id: string) => api.post(jobPath(id, '/pause')).then(r => (
  parseOrFallback(JobActionResponseSchema, r.data, { job_id: id, status: 'paused' }, `pauseJob(${id})`)
));
export const resumeJob = (id: string) => api.post(jobPath(id, '/resume')).then(r => (
  parseOrFallback(JobActionResponseSchema, r.data, { job_id: id, status: 'running' }, `resumeJob(${id})`)
));
export const uploadBundle = (file: File) => {
  const formData = new FormData();
  formData.append('bundle', file);
  return api.post('/bundles/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => (
    parseOrFallback(UploadedBundleSchema, r.data, {}, 'uploadBundle')
  ));
};
export const createJob = (payload: unknown) => api.post('/jobs', payload).then(r => r.data);
export const launchBlueprintJob = (payload: unknown) => api.post('/blueprints/launch/runs', payload).then(r => {
  const result = BlueprintLaunchResponseSchema.safeParse(r.data);
  if (!result.success) {
    console.error('launchBlueprintJob validation failed:', result.error);
    return BlueprintLaunchResponseSchema.parse({});
  }
  return result.data;
});

export const fetchLaunchProgress = (progressId: string) => api.get(launchProgressPath(progressId)).then(r => {
  return parseOrFallback(LaunchProgressResponseSchema, r.data, { progress_id: progressId, events: [] }, `fetchLaunchProgress(${progressId})`);
});
