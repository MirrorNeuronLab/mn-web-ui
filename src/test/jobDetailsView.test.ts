import { describe, expect, it } from 'vitest';
import { JobDetailsSchema, WorkflowProgressSchema } from '../api';
import {
  canonicalActionStatus,
  displayStatusFromSources,
  inferredTerminalStatusFromProgress,
  observabilitySummaryFrom,
  traceIdFrom,
  webUiInfoFromRecord,
} from '../utils/jobDetailsView';

describe('job details view helpers', () => {
  it('discovers safe web ui handles from details and arbitrary records', () => {
    expect(webUiInfoFromRecord({
      web_ui: { url: 'http://localhost:61000', title: 'Nested Dashboard', status: 'running' },
    })).toEqual({
      url: 'http://localhost:61000/',
      title: 'Nested Dashboard',
      status: 'running',
    });
  });

  it('keeps terminal progress ahead of action feedback and paused jobs ahead of running progress', () => {
    expect(displayStatusFromSources('paused', 'completed', 'running', 'running')).toBe('completed');
    expect(displayStatusFromSources('resuming', 'running', 'paused', 'running')).toBe('resuming');
    expect(displayStatusFromSources(null, 'running', 'paused', 'running')).toBe('paused');
    expect(displayStatusFromSources(null, 'unknown', 'unknown', 'pending')).toBe('pending');
    expect(canonicalActionStatus({ status: ' Resumed ' }, 'pending')).toBe('running');
    expect(canonicalActionStatus({ status: 'canceled' }, 'pending')).toBe('cancelled');
  });

  it('does not infer service completion or completion while agents are running', () => {
    const progress = WorkflowProgressSchema.parse({
      job_id: 'run-1', status: 'running', progress_source: 'complete', steps: [],
      agent_count: { total: 2, done: 2 },
    });
    expect(inferredTerminalStatusFromProgress(progress)).toBe('completed');
    expect(inferredTerminalStatusFromProgress({ ...progress, workflow_kind: 'service' })).toBeUndefined();
    expect(inferredTerminalStatusFromProgress({ ...progress, agent_count: { ...progress.agent_count, running: 1 } })).toBeUndefined();
    expect(inferredTerminalStatusFromProgress({ ...progress, agent_count: { ...progress.agent_count, done: 1, failed: 1 } })).toBe('failed');
  });

  it('uses nonempty observability records and skips unknown trace identities in precedence order', () => {
    const details = JobDetailsSchema.parse({
      job: { trace_id: 'job-trace' }, trace_id: ' unknown ',
      observability_summary: { trace_id: 'details-summary' },
    });
    const progress = WorkflowProgressSchema.parse({ job_id: 'run-1', observability_summary: {}, steps: [] });
    const summary = observabilitySummaryFrom(details, progress, { observability_summary: { trace_id: 'fallback' } });
    expect(summary).toEqual({ trace_id: 'details-summary' });
    expect(traceIdFrom(details, progress, {}, summary)).toBe('job-trace');
  });
});
