import { describe, expect, it } from 'vitest';
import { blueprintWebUiInfo, webUiInfoFromRecord } from '../utils/jobDetailsView';

describe('job details view helpers', () => {
  it('discovers safe web ui handles from details and arbitrary records', () => {
    expect(webUiInfoFromRecord({
      web_ui: { url: 'http://localhost:61000', title: 'Nested Dashboard', status: 'running' },
    })).toEqual({
      url: 'http://localhost:61000/',
      title: 'Nested Dashboard',
      status: 'running',
    });

    expect(blueprintWebUiInfo({
      job: {
        job_id: 'job-1',
        graph_id: 'graph-1',
        status: 'running',
        metadata: {
          web_ui_service: {
            url: 'https://example.com/dashboard',
            title: 'Example Dashboard',
          },
        },
      },
      agents: [],
      sandboxes: [],
      recent_events: [],
    })).toEqual({
      url: 'https://example.com/dashboard',
      title: 'Example Dashboard',
      status: undefined,
    });
  });
});
