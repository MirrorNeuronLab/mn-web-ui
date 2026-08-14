export const routeId = (value: string) => encodeURIComponent(value);
export const blueprintPath = (id: string, suffix = '') => `/blueprints/${routeId(id)}${suffix}`;
export const jobPath = (id: string, suffix = '') => `/jobs/${routeId(id)}${suffix}`;
export const modelPath = (model: string, suffix = '') => `/models/${routeId(model)}${suffix}`;
export const bundlePath = (bundleId: string, suffix = '') => `/bundles/${routeId(bundleId)}${suffix}`;
export const runPath = (id: string, suffix = '') => `/runs/${routeId(id)}${suffix}`;
export const operationPath = (id: string, suffix = '') => `/operations/${routeId(id)}${suffix}`;
