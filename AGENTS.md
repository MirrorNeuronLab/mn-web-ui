# AGENTS.md

Instructions for coding agents working in this repository. These instructions
apply only to `mn-web-ui`.

## Start Here

Read `SPEC.md`, `README.md`, `package.json`, the affected page/API utility, and
its tests. Check `git status` and preserve unrelated changes.

This repository is the React/Vite browser client for `mn-api`. It owns browser
presentation and interaction, not runtime, API, SDK, or blueprint behavior.

## Repository Map

- `src/App.tsx`: route composition.
- `src/pages/`: Dashboard, jobs, job details, models, run submission, and
  per-run UI pages.
- `src/api/`: Axios client, endpoint calls, schemas/parsing, streams, and
  workflow-progress adaptation.
- `src/components/`: reusable application panels, graphs, layout, and dialogs.
- `src/utils/`: pure projections for job status, topology, progress, resources,
  artifacts, and errors.
- `src/hooks/`: reusable lifecycle/polling behavior.
- `config/definitions.ts`: configuration schema and safe defaults.
- `config/node.ts`: environment-file precedence for build/server contexts.
- `src/config/browser.ts`: validated browser configuration exposure.
- `src/test/`: Vitest/Testing Library tests.
- `e2e/`: Playwright browser flows.

## Data and API Rules

- Treat every API, stream, route parameter, config value, and stored browser
  value as untrusted.
- Keep the `API -> schema/parser -> UI model -> component` direction. Validate
  external payloads with Zod or focused adapters before rendering.
- Components handle missing, partial, malformed, loading, empty, and error
  states without blanking the whole view.
- Keep API base URL and bearer-token behavior centralized. Do not scatter Axios
  instances or token handling through components.
- Clean up polling, event streams, and async effects on unmount. Use bounded
  retry/backoff and prevent stale responses from overwriting newer state.
- Never log the API token, authorization headers, raw manifests, sensitive
  artifact contents, or unredacted server payloads.
- Preserve server contract field names in the API layer; map to view models in
  adapters/utilities rather than teaching components transport details.

## UX Principles

Every action follows this loop:

```text
User intent -> immediate feedback -> visible processing -> clear result -> next action
```

- Acknowledge actions immediately and show system status during latency.
- Use precise action labels and consistent controls/status colors.
- Prevent invalid/destructive actions; confirm destructive work and offer
  recovery when the backend supports it.
- Prefer skeletons/progress for meaningful waits and avoid layout shifts.
- Use progressive disclosure for raw manifests, IDs, diagnostics, and advanced
  runtime details.
- Agent workflows expose current step/activity, evidence/failure context, and
  the available human control; do not present a black box.
- Optimistic UI is allowed only when rollback/error reconciliation is explicit.
- Maintain keyboard access, focus management, labels, contrast, and semantics.
  Tests should query by role/name rather than CSS structure.

## Implementation Rules

- Keep view-independent transformations in `src/utils` and test them directly.
- Avoid duplicating server state across unrelated component state. Derive values
  during render where possible.
- Do not change API behavior to solve a presentation-only request.
- New public configuration belongs in `config/definitions.ts`, browser exposure
  when safe, `.env.example`, README, tests, and `SPEC.md` when contractual.
- Do not commit `dist`, Playwright output, local `.env*`, or generated artifacts.

## Verification

```bash
npm run lint
npm test -- --run
npm run build
```

Run `npm run test:e2e` for routing, API integration, polling/streaming, or major
interaction changes when the required browser environment is available.

## Issue-Fixing Policy

- Fix the root cause in the owning UI/API-adapter layer.
- Do not add silent fallback data that hides an API contract failure. Explicit,
  labeled empty/error states are acceptable.
- Keep intentional compatibility handling narrow, observable, and tested.
