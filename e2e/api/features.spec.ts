import { expect, test } from '@playwright/test';

test('dashboard, installed models, benchmarking and the complete blueprint catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Test PC', { exact: true })).toBeVisible();
  await expect(page.getByText('8 cores').first()).toBeVisible();
  await page.goto('/models');
  await expect(page.getByText('Model 054', { exact: true })).toBeVisible();
  await expect(page.getByText('uninstalled', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Benchmark Model 054' }).click();
  await expect(page.getByText('20 tok/s', { exact: true })).toBeVisible();
  await expect(page.getByText('Measured reply', { exact: true })).toBeVisible();
  await page.goto('/run');
  await expect(page.getByLabel('Blueprint').locator('option')).toHaveCount(55);
  await page.getByLabel('Blueprint').selectOption('blueprint-054');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/execution-new-/);
  await expect(page.getByRole('heading', { name: /execution-new-/ })).toBeVisible();
});

test('job history crosses page boundaries and controls the execution rather than its output identity', async ({ page }) => {
  await page.goto('/jobs');
  await page.getByLabel('View job job-history').click();
  await expect(page.getByLabel('View run execution-live')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await page.getByLabel('View run execution-live').click();
  await expect(page.getByRole('heading', { name: 'execution-live' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review evidence/ })).toBeVisible();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.getByText('Review evidence', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Agents', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show agents as code' }).click();
  await expect(page.getByText(/"id": "reviewer"/)).toBeVisible();
  await page.getByRole('tab', { name: 'Communication Logs' }).click();
  await expect(page.getByText('[evidence-064]', { exact: true })).toBeVisible();
  await expect(page.getByText('Not reported', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'events.jsonl', exact: true }).first().click();
  expect((await download).suggestedFilename()).toBe('events.jsonl');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Pause run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Resume run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('reset waits for completion, then conditional archive and delete work', async ({ page }) => {
  await page.goto('/jobs/job-ready');
  await page.getByRole('button', { name: 'Reset data', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset data', exact: true }).click();
  await expect(page.getByText('Job data reset', { exact: true })).toBeVisible();
  await expect(page.getByText('Data generation').locator('strong')).toHaveText('2');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Archive job', exact: true }).click();
  await expect(page.getByLabel('Job and run status')).toContainText('Archived');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});

test('job UI uses the authenticated local proxy and reflects service lifecycle', async ({ page }) => {
  await page.goto('/jobs/job-service/ui');
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Shared operator controls' })).toBeVisible();
  await page.goto('/jobs/job-service');
  await expect(page.getByRole('button', { name: 'Start run', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Replace run…', exact: true }).click();
  await page.getByRole('button', { name: 'Replace run', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/service-/);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Pause run', exact: true }).click();
  await page.goto('/jobs/job-service/ui');
  await expect(page.getByText('This job is paused. Resume it to reopen its web UI.')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('run inventory pagination, bulk pause, cancel and permanent run deletion', async ({ page }) => {
  await page.goto('/runs');
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByLabel('View run execution-live')).toBeVisible();
  await page.getByLabel('Select run execution-live').check();
  await page.getByRole('button', { name: 'Pause (1)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Paused runs', { exact: true })).toBeVisible();
  await page.goto('/jobs/job-history');
  await page.getByLabel('Cancel run execution-live').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel run', exact: true }).click();
  await expect(page.getByLabel('Delete run execution-live')).toBeVisible();
  await page.getByLabel('Delete run execution-live').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete run', exact: true }).click();
  await expect(page.getByLabel('View run execution-live')).toHaveCount(0);
});

test('uploads a validated ZIP and preserves its reviewed configuration during job creation', async ({ page }) => {
  const bundle = await page.request.get('/api/v1/test/bundle');
  expect(bundle.ok()).toBe(true);
  await page.goto('/run');
  await page.getByRole('tab', { name: 'ZIP blueprint', exact: true }).click();
  await page.getByLabel('Upload blueprint ZIP bundle').setInputFiles({ name: 'blueprint.zip', mimeType: 'application/zip', buffer: await bundle.body() });
  await page.getByRole('button', { name: 'Upload ZIP', exact: true }).click();
  await expect(page.getByText('Bundle uploaded', { exact: true }).first()).toBeVisible();
  await page.getByText('Run configuration', { exact: true }).click();
  await page.getByLabel('Configuration overrides').fill('mode="review"\nlimit=5');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/execution-new-/);
  const runId = page.url().split('/').at(-1);
  const run = await (await page.request.get(`/api/v1/runs/${runId}`)).json();
  await page.goto(`/jobs/${run.job_id}`);
  await page.getByText('Configuration and storage', { exact: true }).click();
  await expect(page.getByText(/"mode": "review"/)).toBeVisible();
  await expect(page.getByText(/"limit": 5/)).toBeVisible();
});
