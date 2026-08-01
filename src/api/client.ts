import axios from 'axios';
import { apiBaseUrl, config } from '../config/browser';

const api = axios.create({
  baseURL: apiBaseUrl(),
});

if (config.webApiToken) {
  api.defaults.headers.common.Authorization = `Bearer ${config.webApiToken}`;
}

export const apiVersionBaseUrl = (version: number) => {
  const base = String(api.defaults.baseURL || '/api/v1').replace(/\/+$/, '');
  if (/\/api\/v\d+$/i.test(base)) return base.replace(/\/api\/v\d+$/i, `/api/v${version}`);
  return base;
};

export default api;
