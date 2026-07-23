export type ConfigEnvironment = 'dev' | 'test' | 'production';
export type ConfigValueType = 'string' | 'int' | 'bool' | 'list' | 'url' | 'path';

export type RawConfigValue = string | number | boolean | string[] | undefined;

export type RawConfigSource = Record<string, RawConfigValue>;

type ConfigKeyDefinition<T> = {
  env: string;
  type: ConfigValueType;
  defaultValue?: T;
  required?: boolean;
  sensitive?: boolean;
};

type ConfigDefinitions = {
  [Key in keyof AppConfig]: ConfigKeyDefinition<AppConfig[Key]>;
};

export type AppConfig = {
  env: ConfigEnvironment;
  home: string;
  logLevel: string;
  apiHost: string;
  apiPort: number;
  webUiHost: string;
  webUiPort: number;
  webApiBaseUrl: string;
  webApiToken: string;
  enableDebugPanel: boolean;
  allowedOrigins: string[];
  publicAppUrl: string;
};

const LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error']);

export const CONFIG_KEYS: ConfigDefinitions = {
  env: {
    env: 'MN_ENV',
    type: 'string',
    defaultValue: 'dev',
  },
  home: {
    env: 'MN_HOME',
    type: 'path',
    defaultValue: '~/.mirrorneuron',
  },
  logLevel: {
    env: 'MN_LOG_LEVEL',
    type: 'string',
    defaultValue: 'info',
  },
  apiHost: {
    env: 'MN_API_HOST',
    type: 'string',
    defaultValue: 'localhost',
  },
  apiPort: {
    env: 'MN_API_PORT',
    type: 'int',
    defaultValue: 54001,
  },
  webUiHost: {
    env: 'MN_WEB_UI_HOST',
    type: 'string',
    defaultValue: 'localhost',
  },
  webUiPort: {
    env: 'MN_WEB_UI_PORT',
    type: 'int',
    defaultValue: 55173,
  },
  webApiBaseUrl: {
    env: 'MN_WEB_API_BASE_URL',
    type: 'string',
    defaultValue: '/api/v1',
  },
  webApiToken: {
    env: 'MN_WEB_API_TOKEN',
    type: 'string',
    defaultValue: '',
    sensitive: true,
  },
  enableDebugPanel: {
    env: 'MN_ENABLE_DEBUG_PANEL',
    type: 'bool',
    defaultValue: false,
  },
  allowedOrigins: {
    env: 'MN_ALLOWED_ORIGINS',
    type: 'list',
    defaultValue: [],
  },
  publicAppUrl: {
    env: 'MN_PUBLIC_APP_URL',
    type: 'url',
    defaultValue: '',
  },
};

export const CONFIG_ENV_NAMES = Object.values(CONFIG_KEYS).map((definition) => definition.env);
export const BROWSER_CONFIG_ENV_NAMES = [
  CONFIG_KEYS.env.env,
  CONFIG_KEYS.logLevel.env,
  CONFIG_KEYS.webApiBaseUrl.env,
  CONFIG_KEYS.webApiToken.env,
  CONFIG_KEYS.enableDebugPanel.env,
  CONFIG_KEYS.publicAppUrl.env,
];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function normalizeConfigEnvironment(value: RawConfigValue): ConfigEnvironment {
  const normalized = String(value || 'dev').trim().toLowerCase();

  if (normalized === 'dev' || normalized === 'development') {
    return 'dev';
  }
  if (normalized === 'test') {
    return 'test';
  }
  if (normalized === 'prod' || normalized === 'production') {
    return 'production';
  }

  throw new ConfigError(
    `Invalid MN_ENV "${String(value)}". Expected one of: dev, development, test, prod, production.`,
  );
}

export function envFileSuffixFor(environment: ConfigEnvironment) {
  if (environment === 'production') {
    return 'prod';
  }
  return environment;
}

export function createAppConfig(
  rawConfig: RawConfigSource,
  options: { requiredKeys?: readonly (keyof AppConfig)[] } = {},
): AppConfig {
  const requiredKeys = new Set(options.requiredKeys ?? []);

  const config = Object.fromEntries(
    Object.entries(CONFIG_KEYS).map(([key, definition]) => {
      const appConfigKey = key as keyof AppConfig;
      const rawValue = rawConfig[definition.env];
      const value = rawValue === undefined || rawValue === ''
        ? definition.defaultValue
        : rawValue;
      const required = Boolean(definition.required) || requiredKeys.has(appConfigKey);

      if ((value === undefined || value === '') && required) {
        throw new ConfigError(`Missing required config variable: ${definition.env}`);
      }

      return [key, parseConfigValue(definition.env, definition.type, value)];
    }),
  ) as AppConfig;

  config.env = normalizeConfigEnvironment(rawConfig.MN_ENV ?? config.env);

  if (!LOG_LEVELS.has(config.logLevel)) {
    throw new ConfigError(
      `Invalid MN_LOG_LEVEL "${config.logLevel}". Expected one of: trace, debug, info, warn, error.`,
    );
  }

  return config;
}

export function loggableConfig(config: AppConfig) {
  return Object.fromEntries(
    Object.entries(CONFIG_KEYS).map(([key, definition]) => {
      const value = config[key as keyof AppConfig];
      return [definition.env, definition.sensitive ? '[redacted]' : value];
    }),
  );
}

function parseConfigValue(envName: string, type: ConfigValueType, value: RawConfigValue) {
  if (value === undefined) {
    return undefined;
  }

  if (type === 'int') {
    return parseInteger(envName, value);
  }
  if (type === 'bool') {
    return parseBoolean(envName, value);
  }
  if (type === 'list') {
    return parseList(value);
  }
  if (type === 'url') {
    return parseUrl(envName, value);
  }
  if (type === 'path') {
    return String(value).trim();
  }

  return String(value).trim();
}

function parseInteger(envName: string, value: RawConfigValue) {
  const parsed = Number(String(value).trim());

  if (!Number.isInteger(parsed)) {
    throw new ConfigError(`Invalid integer for ${envName}: "${String(value)}"`);
  }

  return parsed;
}

function parseBoolean(envName: string, value: RawConfigValue) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  throw new ConfigError(`Invalid boolean for ${envName}: "${String(value)}"`);
}

function parseList(value: RawConfigValue) {
  if (Array.isArray(value)) {
    return value;
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseUrl(envName: string, value: RawConfigValue) {
  const trimmed = String(value).trim();

  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed).toString().replace(/\/+$/, '');
  } catch {
    throw new ConfigError(`Invalid URL for ${envName}: "${trimmed}"`);
  }
}
