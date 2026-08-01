import { afterEach, describe, expect, it } from 'vitest';
import api, { apiVersionBaseUrl } from '../api/client';

describe('apiVersionBaseUrl', () => {
  const originalBaseUrl = api.defaults.baseURL;

  afterEach(() => {
    api.defaults.baseURL = originalBaseUrl;
  });

  it('derives sibling API versions for relative and absolute bases', () => {
    api.defaults.baseURL = '/api/v1/';
    expect(apiVersionBaseUrl(2)).toBe('/api/v2');

    api.defaults.baseURL = 'https://runtime.example.test/api/v1';
    expect(apiVersionBaseUrl(2)).toBe('https://runtime.example.test/api/v2');
  });

  it('preserves a custom unversioned base', () => {
    api.defaults.baseURL = '/runtime-api';
    expect(apiVersionBaseUrl(2)).toBe('/runtime-api');
  });
});
