import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BROWSER_CONFIG_ENV_NAMES,
  CONFIG_ENV_NAMES,
  type AppConfig,
  type RawConfigSource,
  createAppConfig,
  envFileSuffixFor,
  normalizeConfigEnvironment,
} from './definitions';

export type LoadedNodeConfig = {
  app: AppConfig;
  raw: Record<string, string>;
  environmentFile: string;
  loadedFiles: string[];
};

type LoadNodeConfigOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requiredKeys?: readonly (keyof AppConfig)[];
};

export function loadNodeConfig(options: LoadNodeConfigOptions = {}): LoadedNodeConfig {
  const cwd = options.cwd ?? process.cwd();
  const realEnv = options.env ?? process.env;
  const environment = normalizeConfigEnvironment(realEnv.MN_ENV);
  const environmentFile = `.env.${envFileSuffixFor(environment)}`;
  const loadedFiles: string[] = [];
  const envDefaults = loadDotEnvFile(resolve(cwd, '.env'), loadedFiles);
  const environmentDefaults = loadDotEnvFile(resolve(cwd, environmentFile), loadedFiles);
  const raw = filterSupportedConfig({
    ...envDefaults,
    ...environmentDefaults,
    ...realEnv,
    MN_ENV: realEnv.MN_ENV ?? environment,
  });

  return {
    app: createAppConfig(raw, { requiredKeys: options.requiredKeys }),
    raw,
    environmentFile,
    loadedFiles,
  };
}

export function publicBrowserConfig(raw: RawConfigSource) {
  return filterSupportedConfig(raw, BROWSER_CONFIG_ENV_NAMES);
}

function loadDotEnvFile(path: string, loadedFiles: string[]) {
  if (!existsSync(path)) {
    return {};
  }

  loadedFiles.push(path);
  return parseDotEnv(readFileSync(path, 'utf8'));
}

export function parseDotEnv(contents: string) {
  const parsed: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    parsed[key] = stripDotEnvQuotes(rawValue);
  }

  return parsed;
}

function stripDotEnvQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const commentIndex = value.search(/\s+#/);
  if (commentIndex >= 0) {
    return value.slice(0, commentIndex).trim();
  }

  return value;
}

function filterSupportedConfig(source: RawConfigSource, keys = CONFIG_ENV_NAMES) {
  return Object.fromEntries(
    keys
      .map((key) => [key, source[key]])
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}
