import { createAppConfig } from '../../config/definitions';

declare const __MN_WEB_CONFIG__: Record<string, string | undefined> | undefined;

const injectedConfig = typeof __MN_WEB_CONFIG__ === 'undefined' ? {} : __MN_WEB_CONFIG__;

export const config = createAppConfig(injectedConfig);

export const DEFAULT_API_BASE_URL = '/api/v1';

const normalizeBaseUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/\/+$/, '');
  // Browser client only supports same-origin path bases (e.g. `/api/v1`).
  // Absolute URLs are rejected to avoid leaking the bearer token cross-origin.
  if (!trimmed || !trimmed.startsWith('/')) {
    throw new Error(
      `Invalid web API base URL "${raw}". Expected a same-origin path starting with "/" (e.g. "/api/v1").`,
    );
  }
  return trimmed;
};

export function apiBaseUrl() {
  try {
    return normalizeBaseUrl(config.webApiBaseUrl);
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

export function resolveApiBaseUrl(raw: string): string {
  return normalizeBaseUrl(raw);
}

export function authToken(): string {
  return config.webApiToken.trim();
}

export function authHeader(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
