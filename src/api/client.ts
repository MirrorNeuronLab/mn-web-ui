import axios from 'axios';
import { apiBaseUrl, authToken } from '../config/browser';

const api = axios.create({
  baseURL: apiBaseUrl(),
});

api.interceptors.request.use((request) => {
  request.baseURL = apiBaseUrl();
  const token = authToken();
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  } else {
    request.headers.delete('Authorization');
  }
  return request;
});

export const getApiBaseUrl = () => apiBaseUrl();
export const getAuthHeader = (): Record<string, string> => {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default api;
