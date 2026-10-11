import { describe, expect, it } from 'vitest';
import api from '../api/client';

describe('API client', () => {
  it('uses REST v1 with a bounded request deadline', () => {
    expect(api.defaults.baseURL).toBe('/api/v1');
    expect(api.defaults.timeout).toBe(30_000);
  });
});
