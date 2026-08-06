import axios from 'axios';
import { apiBaseUrl, config } from '../config/browser';

const api = axios.create({
  baseURL: apiBaseUrl(),
});

if (config.webApiToken) {
  api.defaults.headers.common.Authorization = `Bearer ${config.webApiToken}`;
}

export default api;
