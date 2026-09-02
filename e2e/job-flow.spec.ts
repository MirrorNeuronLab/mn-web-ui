import { expect, test, type Page } from '@playwright/test';

const blueprintPage = {
  items: [{ id: 'browser_flow_graph', name: 'Browser flow graph', description: 'Browser flow job' }],
  next_page_token: null,
};

const workflowProgress = (runId: string, status: string) => ({
  schema_version: 1,
  job_id: runId,
  workflow_id: 'browser_flow_graph',
  name: 'Browser flow job',
  description: 'Browser flow job',
  status,
  elapsed_seconds: 4,
  agent_count: { done: status === 'running' ? 0 : 1, total: 1 },
  current_step_id: 'node_1',
  current_step: {
    id: 'node_1',
    label: 'Node 1',
    goal: 'router',
    status,
    current: true,
    done_count: status === 'running' ? 0 : 1,
    total_count: 1,
    elapsed_seconds: 4,
    agents: [],
  },
  steps: [],
  messages: [`Running: ${status}`],
  recent_events: [],
});

const installRunRoutes = async (
  page: Page,
  runId: string,
  status: () => string,
  updateStatus: (next: string) => void,
) => {
  await page.route(/\/api\/v1\/runs(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          run_id: runId,
          graph_id: 'browser_flow_graph',
          status: status(),
          submitted_at: '2026-05-11T14:00:00Z',
          active_executors: status() === 'running' ? 1 : 0,
          executor_count: 1,
        }],
        next_page_token: null,
      }),
    });
  });
  await page.route(`**/api/v1/runs/${runId}/monitor*`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        job: { job_id: runId, run_id: runId, graph_id: 'browser_flow_graph', status: status() },
        agents: [],
        recent_events: [],
      }),
    });
  });
  await page.route(`**/api/v1/runs/${runId}/workflow-progress`, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(workflowProgress(runId, status())) });
  });
  await page.route(`**/api/v1/runs/${runId}/events/stream*`, async (route) => {
    const envelope = {
      id: '1',
      type: 'run.snapshot',
      occurred_at: '2026-05-11T14:00:01Z',
      resource: `/api/v1/runs/${runId}`,
      data: workflowProgress(runId, status()),
    };
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `id: 1\nevent: run.snapshot\ndata: ${JSON.stringify(envelope)}\n\n`,
    });
  });
  await page.route(new RegExp(`/api/v1/runs/${runId}/events(?:\\?.*)?$`), async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_page_token: null }),
    });
  });
  await page.route(`**/api/v1/runs/${runId}/agent-graph`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ job_id: runId, status: status(), nodes: [], edges: [], stats: {} }),
    });
  });
  await page.route(/\/api\/v1\/jobs\/[^/]+\/ui$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: runId,
        ui: { schema_version: 'mn.web_ui.external.v1', renderer: 'external-url', job_id: runId, title: 'Blueprint Web UI' },
        web_ui: { adapter: 'external-url', kind: 'service', title: 'Blueprint Web UI', url: '', status: 'unknown', metadata: {} },
      }),
    });
  });
  await page.route(`**/api/v1/runs/${runId}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = await route.request().postDataJSON();
      const next = body.desired_state === 'cancelled' ? 'cancelled' : body.desired_state;
      updateStatus(next);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ run_id: runId, job_id: 'browser-job-1', status: next }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ run_id: runId, job_id: 'browser-job-1', status: status() }),
    });
  });
};

test('submits an opaque bundle and controls its canonical Run', async ({ page }) => {
  let runStatus = 'running';
  await page.route('**/api/v1/blueprints*', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(blueprintPage),
  }));
  await page.route('**/api/v1/bundles', async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ bundle_id: 'bundle_01JABC' }) });
  });
  await page.route('**/api/v1/jobs', async (route) => {
    expect(await route.request().postDataJSON()).toEqual({ bundle_id: 'bundle_01JABC' });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    await route.fulfill({ status: 201, headers: { Location: '/api/v1/jobs/browser-job-1' }, contentType: 'application/json', body: JSON.stringify({ job_id: 'browser-job-1' }) });
  });
  await page.route('**/api/v1/jobs/browser-job-1/runs', async (route) => {
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    await route.fulfill({ status: 202, headers: { Location: '/api/v1/runs/browser-run-1' }, contentType: 'application/json', body: JSON.stringify({ run_id: 'browser-run-1', status: 'pending' }) });
  });
  await installRunRoutes(page, 'browser-run-1', () => runStatus, (next) => { runStatus = next; });

  await page.goto('/run');
  await page.getByRole('tab', { name: 'ZIP bundle' }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from('fake zip contents'),
  });
  await page.getByRole('button', { name: 'Upload ZIP' }).click();
  await expect(page.getByText('bundle_01JABC', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Launch' }).click();
  await page.getByRole('button', { name: 'Launch' }).last().click();
  await expect(page).toHaveURL(/\/runs\/browser-run-1$/);

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Pause run' }).click();
  await expect(page.getByText('paused').first()).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.getByText('running').first()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByRole('cell', { name: /cancelled/i })).toBeVisible();
});

test('creates a catalog Run directly without launch-progress aliases', async ({ page }) => {
  let requests = 0;
  let runStatus = 'running';
  await page.route('**/api/v1/blueprints*', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(blueprintPage),
  }));
  await page.route('**/api/v1/blueprints/browser_flow_graph/runs', async (route) => {
    requests += 1;
    expect(await route.request().postDataJSON()).toEqual({ config_overrides: {} });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    await route.fulfill({ status: 202, headers: { Location: '/api/v1/runs/catalog-run-1' }, contentType: 'application/json', body: JSON.stringify({ run_id: 'catalog-run-1', status: 'pending' }) });
  });
  await installRunRoutes(page, 'catalog-run-1', () => runStatus, (next) => { runStatus = next; });

  await page.goto('/run');
  await expect(page.locator('#blueprint-select')).toHaveValue('browser_flow_graph');
  await page.getByRole('button', { name: 'Launch' }).click();
  await page.getByRole('button', { name: 'Launch' }).last().click();
  await expect(page).toHaveURL(/\/runs\/catalog-run-1$/);
  expect(requests).toBe(1);
  await expect(page.getByRole('heading', { name: 'catalog-run-1' })).toBeVisible();
});
