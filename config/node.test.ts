import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, createAppConfig, loggableConfig } from './definitions';
import { loadNodeConfig, publicBrowserConfig } from './node';

const tempDirs: string[] = [];

function makeTempDir() {
  const path = mkdtempSync(join(tmpdir(), 'mn-web-ui-config-'));
  tempDirs.push(path);
  return path;
}

function writeEnvFile(cwd: string, name: string, contents: string) {
  writeFileSync(join(cwd, name), contents);
}

describe('node config loader', () => {
  afterEach(() => {
    while (tempDirs.length) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('loads defaults from .env', () => {
    const cwd = makeTempDir();
    writeEnvFile(cwd, '.env', 'MN_API_PORT=8000\nMN_LOG_LEVEL=debug\n');

    const loaded = loadNodeConfig({ cwd, env: {} });

    expect(loaded.app.apiPort).toBe(8000);
    expect(loaded.app.logLevel).toBe('debug');
    expect(loaded.loadedFiles.map((path) => path.endsWith('.env'))).toContain(true);
  });

  it('loads .env.dev when MN_ENV is unset', () => {
    const cwd = makeTempDir();
    writeEnvFile(cwd, '.env.dev', 'MN_WEB_UI_PORT=55174\n');

    const loaded = loadNodeConfig({ cwd, env: {} });

    expect(loaded.app.env).toBe('dev');
    expect(loaded.environmentFile).toBe('.env.dev');
    expect(loaded.app.webUiPort).toBe(55174);
  });

  it.each(['dev', 'development'])('loads .env.dev for MN_ENV=%s', (mnEnv) => {
    const cwd = makeTempDir();
    writeEnvFile(cwd, '.env.dev', 'MN_WEB_UI_HOST=127.0.0.1\n');

    const loaded = loadNodeConfig({ cwd, env: { MN_ENV: mnEnv } });

    expect(loaded.app.env).toBe('dev');
    expect(loaded.app.webUiHost).toBe('127.0.0.1');
  });

  it('lets .env.test override .env', () => {
    const cwd = makeTempDir();
    writeEnvFile(cwd, '.env', 'MN_LOG_LEVEL=info\n');
    writeEnvFile(cwd, '.env.test', 'MN_LOG_LEVEL=warn\n');

    const loaded = loadNodeConfig({ cwd, env: { MN_ENV: 'test' } });

    expect(loaded.environmentFile).toBe('.env.test');
    expect(loaded.app.env).toBe('test');
    expect(loaded.app.logLevel).toBe('warn');
  });

  it('lets real environment variables override .env files', () => {
    const cwd = makeTempDir();
    writeEnvFile(cwd, '.env', 'MN_API_PORT=8000\n');
    writeEnvFile(cwd, '.env.dev', 'MN_API_PORT=8001\n');

    const loaded = loadNodeConfig({ cwd, env: { MN_API_PORT: '8080' } });

    expect(loaded.app.apiPort).toBe(8080);
  });

  it.each(['prod', 'production'])('loads .env.prod for MN_ENV=%s when present', (mnEnv) => {
    const cwd = makeTempDir();
    writeEnvFile(cwd, '.env.prod', 'MN_WEB_API_BASE_URL=https://example.com/api\n');

    const loaded = loadNodeConfig({ cwd, env: { MN_ENV: mnEnv } });

    expect(loaded.app.env).toBe('production');
    expect(loaded.environmentFile).toBe('.env.prod');
    expect(loaded.app.webApiBaseUrl).toBe('https://example.com/api');
  });

  it('allows production to run without any .env file', () => {
    const cwd = makeTempDir();

    const loaded = loadNodeConfig({
      cwd,
      env: {
        MN_ENV: 'production',
        MN_API_HOST: '0.0.0.0',
        MN_API_PORT: '8080',
        MN_WEB_API_BASE_URL: '/api/v1',
      },
    });

    expect(loaded.loadedFiles).toEqual([]);
    expect(loaded.app.env).toBe('production');
    expect(loaded.app.apiHost).toBe('0.0.0.0');
    expect(loaded.app.apiPort).toBe(8080);
  });

  it('fails clearly when a required variable is missing', () => {
    expect(() => createAppConfig({}, { requiredKeys: ['webApiToken'] })).toThrow(
      /Missing required config variable: MN_WEB_API_TOKEN/,
    );
  });

  it('fails clearly when type parsing fails', () => {
    expect(() => createAppConfig({ MN_API_PORT: 'many' })).toThrow(
      /Invalid integer for MN_API_PORT/,
    );
    expect(() => createAppConfig({ MN_ENABLE_DEBUG_PANEL: 'maybe' })).toThrow(
      /Invalid boolean for MN_ENABLE_DEBUG_PANEL/,
    );
    expect(() => createAppConfig({ MN_GRADIO_UI_BASE_URL: 'not a url' })).toThrow(
      /Invalid URL for MN_GRADIO_UI_BASE_URL/,
    );
  });

  it('does not expose secret values in loggable config output', () => {
    const config = createAppConfig({ MN_WEB_API_TOKEN: 'super-secret-token' });

    expect(JSON.stringify(loggableConfig(config))).not.toContain('super-secret-token');
    expect(loggableConfig(config).MN_WEB_API_TOKEN).toBe('[redacted]');
  });

  it('keeps the shared config reusable by node and browser callers', () => {
    const cwd = makeTempDir();
    writeEnvFile(
      cwd,
      '.env',
      [
        'MN_ALLOWED_ORIGINS=https://one.example, https://two.example',
        'MN_HOME=/tmp/mirrorneuron',
        'MN_WEB_API_BASE_URL=https://api.example/v1',
      ].join('\n'),
    );

    const loaded = loadNodeConfig({ cwd, env: {} });
    const cliConfig = createAppConfig(loaded.raw);
    const browserConfig = createAppConfig(publicBrowserConfig(loaded.raw));

    expect(cliConfig.allowedOrigins).toEqual([
      'https://one.example',
      'https://two.example',
    ]);
    expect(browserConfig.webApiBaseUrl).toBe('https://api.example/v1');
    expect(publicBrowserConfig(loaded.raw)).not.toHaveProperty('MN_HOME');
  });

  it('uses ConfigError for invalid MN_ENV values', () => {
    expect(() => loadNodeConfig({ cwd: makeTempDir(), env: { MN_ENV: 'staging' } })).toThrow(
      ConfigError,
    );
  });
});
