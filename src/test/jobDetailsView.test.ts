import { describe, expect, it } from 'vitest';
import { webUiInfoFromRecord } from '../utils/jobDetailsView';

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
});
