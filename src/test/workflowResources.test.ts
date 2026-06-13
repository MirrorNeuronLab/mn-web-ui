import { describe, expect, it } from 'vitest';
import type { JobDetails, WorkflowProgress } from '../api';
import { artifactsFromDetails, buildInputResources, buildOutputResources } from '../utils/workflowResources';

const baseProgress = {
  schema_version: 1,
  job_id: 'job-1',
  workflow_id: 'workflow-1',
  name: 'Workflow One',
  description: '',
  status: 'running',
  workflow_kind: 'batch',
  elapsed_seconds: 0,
  agent_count: { done: 0, running: 0, idle: 0, ready: 0, failed: 0, total: 0 },
  current_step: null,
  steps: [],
  messages: [],
  recent_events: [],
} satisfies WorkflowProgress;

describe('workflow resource helpers', () => {
  it('collects output resources from progress, steps, details, and event payloads', () => {
    const progress: WorkflowProgress = {
      ...baseProgress,
      outputs: [
        { label: 'Hosted result', url: 'https://example.com/result' },
        'runs/job-1/shared.csv',
      ],
      steps: [
        {
          id: 'render',
          label: 'Render report',
          goal: 'Create the report artifact',
          status: 'completed',
          current: false,
          done_count: 1,
          running_count: 0,
          idle_count: 0,
          ready_count: 0,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 2,
          artifacts: [
            {
              artifact_id: 'report_pdf',
              relative_path: 'runs/job-1/report.pdf',
              reveal_url: '/api/v1/artifacts/report_pdf/reveal',
            },
          ],
          provides: ['runs/job-1/shared.csv'],
          agents: [],
        },
      ],
      recent_events: [
        {
          timestamp: '2026-06-12T17:38:02Z',
          type: 'artifact_created',
          payload: {
            files: [{ path: 'runs/job-1/timeline.jsonl', artifact_id: 'timeline_jsonl' }],
          },
        },
      ],
    };
    const details = {
      job: {
        job_id: 'job-1',
        graph_id: 'workflow-1',
        status: 'completed',
        artifacts: [{ artifact_id: 'logs_jsonl', path: '/tmp/job-1/logs.jsonl' }],
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    } satisfies JobDetails;

    const resources = buildOutputResources(progress, details);

    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Hosted result',
        value: 'https://example.com/result',
        href: 'https://example.com/result',
        kind: 'url',
      }),
      expect.objectContaining({
        label: 'runs/job-1/report.pdf',
        value: 'runs/job-1/report.pdf',
        revealUrl: '/api/v1/artifacts/report_pdf/reveal',
        kind: 'file',
      }),
      expect.objectContaining({
        label: 'timeline.jsonl',
        value: 'runs/job-1/timeline.jsonl',
      }),
      expect.objectContaining({
        label: 'logs.jsonl',
        value: '/tmp/job-1/logs.jsonl',
      }),
    ]));
    expect(resources.filter((resource) => resource.value === 'runs/job-1/shared.csv')).toHaveLength(1);
  });

  it('keeps input resources distinguishable from output files while preserving URLs', () => {
    const progress: WorkflowProgress = {
      ...baseProgress,
      inputs: {
        source: { label: 'Source deck', path: '/tmp/input/source.pdf' },
        dashboard: 'https://example.com/source',
      },
      steps: [
        {
          id: 'research',
          label: 'Research',
          goal: 'Collect source material',
          status: 'running',
          current: true,
          done_count: 0,
          running_count: 1,
          idle_count: 0,
          ready_count: 1,
          failed_count: 0,
          total_count: 1,
          live: false,
          elapsed_seconds: 4,
          requires: ['inputs/customer-profile.json'],
          agents: [],
        },
      ],
    };

    const resources = buildInputResources(progress);

    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Source deck',
        value: '/tmp/input/source.pdf',
        kind: 'input',
      }),
      expect.objectContaining({
        value: 'https://example.com/source',
        href: 'https://example.com/source',
        kind: 'url',
      }),
      expect.objectContaining({
        value: 'inputs/customer-profile.json',
        kind: 'input',
      }),
    ]));
  });

  it('returns only well-formed failure artifacts from job details', () => {
    const details = {
      job: { job_id: 'job-1', graph_id: 'workflow-1', status: 'failed' },
      agents: [],
      sandboxes: [],
      recent_events: [],
      artifacts: [
        { artifact_id: 'errors_jsonl', path: '/tmp/job-1/errors.jsonl' },
        'not-an-artifact',
        null,
      ],
    } satisfies JobDetails;

    expect(artifactsFromDetails(details)).toEqual([
      { artifact_id: 'errors_jsonl', path: '/tmp/job-1/errors.jsonl' },
    ]);
  });
});
