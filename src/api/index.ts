import api from './client';
import { z } from 'zod';

export const AgentSchema = z.object({
  agent_id: z.string().optional().default('unknown'),
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
  label: z.string().optional(),
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

export type Agent = z.infer<typeof AgentSchema>;
export type JobEvent = z.infer<typeof JobEventSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobDetails = z.infer<typeof JobDetailsSchema>;
export type AgentGraph = z.infer<typeof AgentGraphSchema>;
export type SystemSummary = z.infer<typeof SystemSummarySchema>;
export type RunUiComponent = z.infer<typeof RunUiComponentSchema>;
export type RunUiDefinition = z.infer<typeof RunUiDefinitionSchema>;
export type WebUiHandle = z.infer<typeof WebUiHandleSchema>;
export type RunUiResponse = z.infer<typeof RunUiResponseSchema>;

export const isServiceJob = (job: Partial<Job> | null | undefined, summary?: { type?: unknown; job_type?: unknown }): boolean => {
  const summaryType = typeof summary?.job_type === 'string' ? summary.job_type : typeof summary?.type === 'string' ? summary.type : '';
  const jobType = job?.job_type || job?.type || '';
  return [summaryType, jobType].some((value) => value.toLowerCase() === 'service');
};

export const fetchSystemSummary = () => api.get('/system/summary').then(r => {
  const result = SystemSummarySchema.safeParse(r.data);
  if (!result.success) {
    console.error('SystemSummary validation failed:', result.error);
    return SystemSummarySchema.parse({}); // return default structured fallback
  }
  return result.data;
});

export const fetchJobs = () => api.get('/jobs').then(r => {
  const data = r.data?.data || [];
  const result = z.array(JobSchema).safeParse(data);
  if (!result.success) {
    console.error('fetchJobs validation failed:', result.error);
    return [];
  }
  return result.data;
});

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
