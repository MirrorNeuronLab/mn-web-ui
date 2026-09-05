# MirrorNeuron Web UI Specification

## Purpose

`mn-web-ui` is the browser interface for observing and operating a MirrorNeuron
runtime through `mn-api`. It presents runtime health, jobs, workflow progress,
topology, events, failures, resources, models, artifacts, and run submission.

This specification applies only to this browser application. The API and
runtime remain authoritative for data and mutation semantics.

## User Surface

The application routes currently include:

- `/`: runtime dashboard;
- `/jobs`: persistent job definitions;
- `/jobs/:jobId`: job configuration, shared data lifecycle, schedules, and run history;
- `/runs`: execution inventory;
- `/runs/:id`: run activity, topology, progress, artifacts, and controls;
- `/models`: model inventory and state;
- `/run`: manifest/job submission; and
- `/jobs/:jobId/ui`: job-specific generated/operator UI shared by every run.

`src/App.tsx` is authoritative for route registration. Pages must remain
direct-linkable and survive refresh with the same route parameters.

## API Boundary

The browser calls the configured API base through the central API client.
Persistent jobs, execution controls, monitor snapshots, public workflow
progress, and execution artifacts use `/api/v1`. Runtime-wide inventory
surfaces may continue to use the configured base. When
`MN_WEB_API_TOKEN` is set, requests send it as a bearer token. The token is
sensitive and is never printed or included in diagnostics.
Job-specific UI definitions use an `external-url` service handle. The service
UI remains rendered at `/jobs/:jobId/ui` in a same-origin frame. Its remote
host is resolved by the local Web UI server from the authenticated job handle,
which proxies only the explicitly allowlisted dashboard/companion ports. The
browser must not navigate directly to a remote runtime node. A paused,
stopped, cancelled, or failed handle displays a lifecycle message instead of
framing its unavailable upstream.

API and streaming payloads are unknown input until parsed. Zod schemas and
focused adapters convert them into stable UI models. Invalid collections may
degrade to safe empty/partial states with a visible diagnostic; invalid data
must not crash the whole app or be silently represented as successful data.

Polling and streams are lifecycle-owned: they stop when their view unmounts or
the operation reaches a terminal state. Reconnect behavior is bounded and
avoids duplicate events or stale-state overwrites.

## Interaction Contract

- Every user action produces immediate visible feedback.
- Long-running operations show their current state and a clear terminal result.
- Destructive or broad mutations require explicit confirmation.
- Stable-job controls use the projected executable `job.type` as their sole
  lifecycle classifier. A `type: service` job shows Start only with no attached
  run, exposes view/pause/resume/cancel controls for its existing run, and uses
  a separate danger-styled Replace action for active or terminal history.
  Replacement confirmation explains cancellation, permanent run-scoped
  history/artifact removal, preserved job data/configuration/schedules, and
  possible deferred cleanup on offline nodes. Compatibility `stream_mode`
  values never enable this single-run behavior.
- Failure messages explain the failed action and a useful next step without
  exposing internal secrets or raw errors.
- Workflow views make status, current activity, evidence/artifacts, failure
  context, and available controls discoverable.
- Workflow list and graph modes render the same public steps returned by
  `/api/v1/runs/{id}/workflow-progress`, preserving the step names, counts, current
  state, and topology shown by `mn job monitor` without exposing lowered
  runtime control nodes.
- Advanced IDs, raw manifests, and diagnostics use progressive disclosure.
- Keyboard navigation, semantic labels, focus restoration, contrast, and
  screen-reader announcements are required for interactive controls.

## Configuration

`config/definitions.ts` defines typed configuration. Node-side loading uses:

```text
real environment > .env.${MN_ENV} > .env > safe defaults
```

Only explicitly listed browser-safe keys are exposed to client code. Sensitive
keys are redacted from loggable configuration. Unsupported environments and
invalid typed values fail clearly during configuration.

## Non-Goals

The Web UI does not implement scheduling, job lifecycle, model placement,
manifest validation, artifact authorization, or persistence. It does not start
local services. It renders and invokes the contracts supplied by `mn-api`.

## Compatibility

Routes, public configuration names, API parsing, status mapping, and user-facing
control semantics are compatibility-sensitive. API evolution should be handled
in the API/adaptation layer with tests. Placeholder/fallback data must never
masquerade as a confirmed runtime result.

## Acceptance

```bash
npm run lint
npm test -- --run
npm run build
```

Playwright E2E covers high-value routing and job flows when an appropriate API
fixture/live environment is available. Unit/component tests remain deterministic
and do not require network access.

## Canonical blueprint descriptors

Catalog rows are derived by the SDK from canonical packages and carry semantic release versions. Browser code consumes the API projection; it never parses or executes package source files. Package validation displays the owning document and JSON Pointer from structured errors, including ZIP upload errors. Folder and ZIP launches share the same server pipeline.
