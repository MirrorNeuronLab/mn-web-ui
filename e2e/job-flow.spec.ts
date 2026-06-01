import { expect, test } from '@playwright/test';

test('submits a bundle and controls the job from the real app shell', async ({ page }) => {
  let jobStatus = 'running';

  await page.route('**/api/v1/bundles/upload', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        bundle_path: '/tmp/e2e-bundle',
        manifest: {
          graph_id: 'browser_flow_graph',
          job_name: 'Browser flow job',
          nodes: [{ node_id: 'node_1', agent_type: 'router' }],
          edges: [],
        },
      }),
    });
  });

  await page.route('**/api/v1/jobs', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: 'browser-job-1', status: 'pending' }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            job_id: 'browser-job-1',
            graph_id: 'browser_flow_graph',
            status: jobStatus,
            submitted_at: '2026-05-11T14:00:00Z',
            active_executors: jobStatus === 'running' ? 1 : 0,
            executor_count: 1,
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        job: {
          job_id: 'browser-job-1',
          graph_id: 'browser_flow_graph',
          status: jobStatus,
          submitted_at: '2026-05-11T14:00:00Z',
        },
        agents: [
          {
            agent_id: 'node_1',
            agent_type: 'router',
            type: 'map',
            status: jobStatus,
            processed_messages: 1,
            mailbox_depth: 0,
            assigned_node: 'local',
          },
        ],
      }),
    });
  });

  const workflowProgress = () => ({
    schema_version: 1,
    job_id: 'browser-job-1',
    workflow_id: 'browser_flow_graph',
    name: 'Browser flow job',
    description: 'Browser flow job',
    status: jobStatus,
    elapsed_seconds: 4,
    agent_count: { done: jobStatus === 'running' ? 0 : 1, total: 1 },
    current_step_id: 'node_1',
    current_step: {
      id: 'node_1',
      label: 'Node 1',
      goal: 'router',
      status: jobStatus,
      current: true,
      done_count: jobStatus === 'running' ? 0 : 1,
      total_count: 1,
      elapsed_seconds: 4,
      agents: [
        {
          id: 'node_1',
          role: 'router',
          working_on: 'router',
          model: 'runtime',
          status: jobStatus,
          progress: jobStatus === 'running' ? 0.5 : 1,
          elapsed_seconds: 4,
        },
      ],
    },
    steps: [],
    messages: [`Running: ${jobStatus}`],
    recent_events: [],
  });

  await page.route('**/api/v1/jobs/browser-job-1/workflow-progress', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(workflowProgress()),
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1/workflow-progress/stream*', async (route) => {
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `event: snapshot\ndata: ${JSON.stringify(workflowProgress())}\n\n`,
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1/events', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            type: 'job_running',
            timestamp: '2026-05-11T14:00:01Z',
            payload: { status: jobStatus },
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1/agent-graph', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: 'browser-job-1',
        graph_id: 'browser_flow_graph',
        status: jobStatus,
        nodes: [
          {
            id: 'node_1',
            label: 'node_1',
            agent_type: 'router',
            type: 'map',
            status: jobStatus,
            assigned_node: 'local',
          },
        ],
        edges: [],
        stats: { agent_count: 1, edge_count: 0, message_count: 1, event_count: 1 },
      }),
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1/pause', async (route) => {
    jobStatus = 'paused';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'browser-job-1', status: 'paused' }),
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1/resume', async (route) => {
    jobStatus = 'running';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'browser-job-1', status: 'resumed' }),
    });
  });

  await page.route('**/api/v1/jobs/browser-job-1/cancel', async (route) => {
    jobStatus = 'cancelled';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 'browser-job-1', status: 'cancelled' }),
    });
  });

  await page.goto('/run');
  await page.setInputFiles('input[type="file"]', {
    name: 'bundle.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('fake zip contents'),
  });

  await expect(page.getByText('Bundle validated successfully')).toBeVisible();
  await expect(page.getByText('browser_flow_graph', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Run Job Now' }).click();
  await expect(page).toHaveURL(/\/jobs\/browser-job-1$/);
  await expect(page.getByRole('heading', { name: 'browser-job-1' })).toBeVisible();
  await expect(page.getByText('running').first()).toBeVisible();

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('paused').first()).toBeVisible();

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('running').first()).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Cancel Job' }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByText('browser-job-1')).toBeVisible();
  await expect(page.getByText('cancelled')).toBeVisible();
});
