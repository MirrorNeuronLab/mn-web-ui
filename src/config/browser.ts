import { createAppConfig } from '../../config/definitions';

declare const __MN_WEB_CONFIG__: Record<string, string | undefined> | undefined;

const injectedConfig = typeof __MN_WEB_CONFIG__ === 'undefined' ? {} : __MN_WEB_CONFIG__;

export const config = createAppConfig(injectedConfig);

export function apiBaseUrl() {
  return config.webApiBaseUrl.replace(/\/+$/, '');
}
