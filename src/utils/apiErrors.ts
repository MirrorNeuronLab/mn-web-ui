type ValidationIssue = {
  code?: string;
  message?: string;
  help?: string;
  location?: { source?: string; path?: string };
  expected?: unknown;
  actual?: unknown;
};

type ApiError = {
  response?: {
    data?: ApiErrorData;
  };
  message?: string;
};

type ApiErrorData = {
  error?: string;
  detail?: string | { error?: string; message?: string };
  message?: string;
  model_install?: {
    models?: Array<{ id?: string; model?: string }>;
  };
  validation?: {
    errors?: string[];
    issues?: ValidationIssue[];
  };
  errors?: ValidationIssue[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const numberValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const stringValue = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

const issueText = (issue: ValidationIssue) => {
  const path = issue.location?.path ? `${issue.location.path}: ` : '';
  return `${path}${issue.message || issue.help || 'Validation issue'}`;
};

const formatGpuMemory = (memoryMb: number) => {
  const gb = memoryMb / 1024;
  return Number.isInteger(gb) ? `${gb}GB` : `${gb.toFixed(1)}GB`;
};

const memoryComparisonText = (operator: string | null, memoryMb: number) => {
  const memory = formatGpuMemory(memoryMb);
  if (operator === '>') return `more than ${memory} GPU memory`;
  if (operator === '==') return `exactly ${memory} GPU memory`;
  return `at least ${memory} GPU memory`;
};

const apiComparisonText = (driver: string, operator: string | null, version: string) => {
  if (operator === '>') return `${driver} newer than ${version}`;
  if (operator === '==') return `${driver} ${version}`;
  return `${driver} ${version} or newer`;
};

const isHardwareRequirementIssue = (issue: ValidationIssue) => (
  issue.code?.startsWith('requirements.gpu') ||
  (issue.location?.source === 'requirements' && issue.location?.path === 'gpu')
);

const isRuntimeModelIssue = (issue: ValidationIssue) => (
  issue.code === 'runtime_model_install_failed' ||
  issue.code === 'blueprint_model_install_failed' ||
  issue.code === 'unknown_runtime_model'
);

const modelNameFromText = (value: string | undefined) => {
  if (!value) return null;
  const quoted = value.match(/['"]([^'"]*(?:gemma|model)[^'"]*)['"]/i)?.[1];
  if (quoted) return quoted;
  const named = value.match(/\b([a-z0-9_.-]+:[a-z0-9_.-]+)\b/i)?.[1];
  return named || null;
};

const modelNameFromInstall = (data: ApiErrorData | undefined) => {
  const models = data?.model_install?.models || [];
  const first = models.find((model) => stringValue(model.id) || stringValue(model.model));
  return stringValue(first?.id) || stringValue(first?.model) || null;
};

const runtimeModelIssueText = (issue: ValidationIssue, data: ApiErrorData | undefined) => {
  const model = modelNameFromText(issue.message) || modelNameFromText(issue.help) || modelNameFromInstall(data) || 'the required runtime model';
  return `Required runtime model ${model} could not be prepared. Check model installation/runtime model settings and try again.`;
};

const hardwareRequirementText = (issue: ValidationIssue) => {
  const expected = isRecord(issue.expected) ? issue.expected : {};
  const vendor = (stringValue(expected.vendor) || 'NVIDIA').toUpperCase();
  const driver = (stringValue(expected.driver) || 'CUDA').toUpperCase();
  const phrases: string[] = [];
  const memoryMb = numberValue(expected.min_memory_mb);
  if (memoryMb !== null) phrases.push(memoryComparisonText(stringValue(expected.memory_operator), memoryMb));
  const apiVersion = stringValue(expected.min_api_version);
  if (apiVersion) phrases.push(apiComparisonText(driver, stringValue(expected.api_version_operator), apiVersion));
  const details = phrases.length > 0 ? ` with ${phrases.join(' and ')}` : '';
  return `This blueprint needs an ${vendor} ${driver} runtime node${details}. Add or connect an ${vendor} node, then launch again.`;
};

export const apiErrorMessage = (err: unknown, fallback: string) => {
  const apiError = err as ApiError;
  const data = apiError.response?.data;
  const validationIssues = data?.validation?.issues || data?.errors || [];
  const hardwareIssue = validationIssues.find(isHardwareRequirementIssue);
  if (hardwareIssue) return hardwareRequirementText(hardwareIssue);
  const runtimeModelIssue = validationIssues.find(isRuntimeModelIssue);
  if (runtimeModelIssue) return runtimeModelIssueText(runtimeModelIssue, data);
  const validationErrors = data?.validation?.errors || [];
  if (validationErrors.length > 0) return validationErrors.join('\n');
  if (validationIssues.length > 0) return validationIssues.map(issueText).join('\n');
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  if (typeof data?.detail === 'string') return data.detail;
  if (data?.detail?.error) return data.detail.error;
  if (data?.detail?.message) return data.detail.message;
  return apiError.message || fallback;
};
