import type { WorkflowActivity } from '../api';

export type ActivityFilter = 'all' | 'agent' | 'tool' | 'system' | 'artifact' | 'error';

export const activityMessage = (event: WorkflowActivity) => (
  event.message || event.result_summary || event.status || event.type || 'Activity observed'
);

export const activityCategory = (event: WorkflowActivity): ActivityFilter => {
  const category = String(event.category || '').toLowerCase();
  if (['agent', 'tool', 'system', 'artifact', 'error'].includes(category)) return category as ActivityFilter;
  const type = String(event.type || '').toLowerCase();
  if (event.failure || type.includes('failed') || type.includes('error') || type.includes('timed_out')) return 'error';
  if (type.includes('tool_call')) return 'tool';
  if (type.includes('artifact')) return 'artifact';
  if (type.startsWith('financial_') || type === 'agent_activity') return 'agent';
  return 'system';
};

export const categoryTone = (category: ActivityFilter) => {
  switch (category) {
    case 'agent': return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'tool': return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'artifact': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'error': return 'border-red-200 bg-red-50 text-red-700';
    case 'system': return 'border-neutral-200 bg-white text-neutral-600';
    default: return 'border-neutral-200 bg-white text-neutral-600';
  }
};

export const filterLabel = (filter: ActivityFilter) => (
  filter === 'all' ? 'All' : filter === 'artifact' ? 'Artifacts' : `${filter.charAt(0).toUpperCase()}${filter.slice(1)}`
);

const compactJson = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const activityDetailText = (event: WorkflowActivity) => {
  const detail = {
    target: event.target,
    tool_name: event.tool_name,
    status: event.status,
    duration_ms: event.duration_ms,
    result_summary: event.result_summary,
    details: event.details,
    failure: event.failure,
  };
  return Object.values(detail).some((value) => value !== undefined && value !== null && value !== '')
    ? compactJson(detail)
    : '';
};

export const uniqueActivities = (activities: WorkflowActivity[]) => {
  const seen = new Set<string>();
  return activities.filter((event) => {
    const key = `${event.timestamp || 'unknown'}-${event.type || 'event'}-${event.step_id || ''}-${event.agent_id || ''}-${event.message || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
