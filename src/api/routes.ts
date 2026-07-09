export const routeId = (value: string) => encodeURIComponent(value);
export const blueprintPath = (id: string, suffix = '') => `/blueprints/${routeId(id)}${suffix}`;
export const jobPath = (id: string, suffix = '') => `/jobs/${routeId(id)}${suffix}`;
export const modelPath = (model: string, suffix = '') => `/models/${routeId(model)}${suffix}`;
export const bundlePath = (bundleId: string, suffix = '') => `/bundles/${routeId(bundleId)}${suffix}`;
export const runPath = (id: string, suffix = '') => `/runs/${routeId(id)}${suffix}`;
export const launchProgressPath = (progressId: string) => `/blueprints/launch/progress/${routeId(progressId)}`;

export const apiPathFromUrl = (
  url: string,
  base: string,
  currentOrigin = globalThis.location?.origin,
) => {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Artifact reveal URL is empty');
  if (trimmed.startsWith(`${base}/`)) return trimmed.slice(base.length);
  if (trimmed === base) return '/';
  if (trimmed.startsWith('/api/v1/')) return trimmed.slice('/api/v1'.length);
  if (trimmed === '/api/v1') return '/';
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    const baseUrl = /^https?:\/\//i.test(base) ? new URL(base) : null;
    const basePath = baseUrl?.pathname.replace(/\/$/, '') || '';
    if (baseUrl && parsed.origin === baseUrl.origin && parsed.pathname.startsWith(`${basePath}/`)) {
      return `${parsed.pathname.slice(basePath.length)}${parsed.search}`;
    }
    if (currentOrigin && parsed.origin === currentOrigin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    throw new Error('Artifact reveal URL must be same-origin');
  }
  if (trimmed.startsWith('//')) throw new Error('Artifact reveal URL must be same-origin');
  return trimmed;
};
