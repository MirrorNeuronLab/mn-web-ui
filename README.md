# MirrorNeuron Web UI

`mn-web-ui` is the React/Vite browser interface for operating persistent
MirrorNeuron jobs and inspecting their execution runs, workflow graphs, events,
artifacts, runtime resources, and models through `mn-api`.

The main lifecycle surfaces are intentionally separate:

- **Jobs** use `/api/v1` and own reusable configuration, schedules, shared data,
  and run history.
- **Runs** are individual executions. Lifecycle controls, live progress,
  monitor snapshots, agent graphs, events, and artifacts use `/api/v1`.

The run monitor defaults to a selectable public-step list and can switch to the
equivalent workflow graph. Live progress supplies execution state; the job's
latest-run workflow resources supply labels, agent roles, and topology. They
are combined only when their execution identities match. Historical runs whose
shape is unavailable show an explicit notice and runtime step identifiers.
Runtime-only control nodes are not UI steps.

## Quick Start

Install dependencies and start the development server:

```bash
npm install
export MN_ENV=dev
cp .env.example .env.dev
npm run dev
```

Run local checks:

```bash
npm run lint
npm test -- --run
npm run build
npm run test:e2e
```

The normal browser suite uses deterministic HTTP fixtures. To additionally test
against the current API's actual routes and Web UI reverse proxy, keep sibling
`mn-api` and `mn-python-sdk` checkouts and provide a Python interpreter with the
API dependencies installed:

```bash
MN_WEB_E2E_PYTHON=/path/to/python npm run test:api
```

`MN_WEB_E2E_API_SOURCE` may override the sibling API checkout path. This gate
uses ports 54009 and 4174, temporary storage, and a fake runtime. It verifies
authentication, pagination, ZIP validation/upload, launch requests, progress,
downloads, model benchmarks, job/run controls, data resets, and embedded service
UI without executing real work or accessing user runtime storage.

Default local URL:

```text
http://localhost:55173
```

## Details

- [MirrorNeuron Component Guide](../mn-docs/component-guide.md#web-ui)
- [Monitor Guide](../mn-docs/monitor.md)
- [API Reference](../mn-docs/api.md)

## Notes

- Start `mn-api` before using live runtime screens.
- The browser API base is a same-origin path, normally `/api/v1`. Absolute and
  protocol-relative bases are rejected to keep bearer tokens on the local origin.
- Set `MN_WEB_API_TOKEN` when connecting to a protected API instance.
- Job IDs, execution IDs, and output-storage IDs are separate identities. Run
  routes and controls always use the canonical execution ID; job UI routes use
  the durable job ID returned by the canonical Run resource.
- Models request `installed_only=true`. Catalogs, models, events, and job run
  history follow the API's opaque page cursors. Jobs and Runs retain expanded
  pages while polling their current contents and cursor.
- Protected artifact/output links download through the authenticated API client.
  Reads time out after 30 seconds, benchmarks after 70 seconds, and explicit
  preparation/upload commands after 30 minutes. Data reset waits for its accepted
  operation to complete, with a five-minute polling deadline.
- Blueprint-owned interfaces are `external-url` service handles. Service pages
  remain under the local `/jobs/:jobId/ui` route: the local Web UI server
  proxies only the job's declared dashboard, video, and WebSocket companion
  ports, so the browser never needs to navigate directly to a remote runtime
  node. Paused, stopped, cancelled, and failed services show a lifecycle
  message instead of framing a dead upstream. Handles reporting
  `metadata.readiness.ready=false` wait until the API reports readiness.

## Configuration

Configuration is defined in `config/definitions.ts` and loaded by `config/node.ts`.
The loader uses this precedence:

```text
real environment variables
> .env.${MN_ENV}
> .env
> built-in safe defaults
```

`MN_ENV` defaults to `dev` when unset. `dev` and `development` load `.env.dev`,
`test` loads `.env.test`, and `prod` or `production` load `.env.prod` when it
exists. Production does not require any `.env` file.

Development example:

```bash
export MN_ENV=dev
cp .env.example .env.dev
npm run dev
```

Test example:

```bash
export MN_ENV=test
npm test -- --run
```

Production example:

```bash
export MN_ENV=production
export MN_HOME=/var/lib/mirrorneuron
export MN_LOG_LEVEL=info
export MN_API_HOST=0.0.0.0
export MN_API_PORT=8080
export MN_WEB_API_BASE_URL=/api/v1
npm run build
```

Do not commit real `.env` files. Use `.env.example` for documented placeholders
only, and provide secrets such as `MN_WEB_API_TOKEN` through deployment
environment variables.

Blueprint catalog information comes from the canonical package manifest and its role documents. Validation errors identify the document and JSON Pointer to correct. See the [blueprint format](../mn-docs/blueprint-standard.md).

## Standard runtime activity

Runtime events use the shared [`mn.runtime.event.v1` contract](../mn-python-sdk/docs/runtime-activity.md),
including level, blueprint owner, UTC timestamp and actor attribution.
The SDK selects meaningful activity for the CLI, API, desktop and web monitors;
raw events remain available for diagnostics.
