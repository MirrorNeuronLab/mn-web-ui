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
- `/jobs`: job inventory;
- `/jobs/:id`: job activity, topology, progress, artifacts, and controls;
- `/models`: model inventory and state;
- `/run`: manifest/job submission; and
- `/runs/:runId/ui`: run-specific generated/operator UI.

`src/App.tsx` is authoritative for route registration. Pages must remain
direct-linkable and survive refresh with the same route parameters.

## API Boundary

The browser calls the configured API base (safe default `/api/v1`) through the
central API client. When `MN_WEB_API_TOKEN` is set, requests send it as a bearer
token. The token is sensitive and is never printed or included in diagnostics.

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
- Failure messages explain the failed action and a useful next step without
  exposing internal secrets or raw errors.
- Workflow views make status, current activity, evidence/artifacts, failure
  context, and available controls discoverable.
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
