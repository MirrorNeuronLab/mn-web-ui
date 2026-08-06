import { describe, expect, it } from 'vitest';
import api from '../api/client';

describe('API client', () => {
  it('uses the v2 API by default', () => {
    expect(api.defaults.baseURL).toBe('/api/v2');
  });
});
