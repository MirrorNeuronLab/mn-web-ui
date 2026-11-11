# MirrorNeuron Web UI

## Current contracts

Use `fetchRuns` and `FetchRunsOptions` for executions. The historical `fetchJobs` and `FetchJobsOptions` aliases are removed. Deploy the UI with the matching current API contract.

Backward compatibility and automatic migration of obsolete state are unsupported.

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

The normal browser suite uses deterministic HTTP fixtures. To test the current
API and native runtime service, keep sibling `mn-api` and `mn-python-sdk`
checkouts and use a Python 3.12+ environment with their API and runtime
dependencies installed:

```bash
MN_WEB_E2E_PYTHON=/path/to/python npm run test:api
MN_WEB_E2E_PYTHON=/path/to/python MN_WEB_E2E_PROXY=compose npm run test:api
```

`MN_WEB_E2E_API_SOURCE` may override the API checkout path. The Compose option
runs the proxy from the sibling `mn-deploy` checkout. Both options use ports
4174 and 54009–54011, temporary storage, and a deterministic Core fixture. They
exercise the real API and gRPC transport for authentication, pagination, ZIP
uploads, launch progress, runtime notifications, downloads, run controls, and
embedded service pages and WebSockets.

Default local URL:

```text
http://localhost:55173
```

## Details

- [MirrorNeuron Component Guide](../mn-docs/component-guide.md#web-ui)
- [Monitor Guide](../mn-docs/monitor.md)
- [API Reference](../mn-docs/api.md)

## Notes

- Start `mn-api` before using live runtime screens. It uses the native runtime
  connection shared with the CLI. Use `mn node add local` for a local runtime
  or `mn node add <HOST> --token <RUNTIME_NODE_TOKEN>` for a remote runtime.
- The browser API base is a same-origin path, normally `/api/v1`. Absolute and
  protocol-relative bases are rejected to keep bearer tokens on the local origin.
- The installed Web UI proxy sends the surface API credential from the server.
  For Vite development with a protected API, set `MN_WEB_API_TOKEN` locally.
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

## Runtime delivery flows

The run monitor subscribes to independent errors and responses SSE channels in
addition to workflow snapshots. Core, SDK/native and API must be deployed with the
v2 delivery contract. Protected subscriptions preserve per-channel replay cursors,
deduplicate by event position, and merge incident recovery using the same incident
identity. A first failure remains visible while the ledger decides retry or
termination. Recovery updates that incident without closing observation or changing
the run's status. Command acceptance/execution/completion notifications remain
separate from workflow completion.

See [SPEC.md](SPEC.md) for queue guarantees, correlation, replay, and compatibility details.
