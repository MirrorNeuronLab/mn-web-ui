# MirrorNeuron Web UI

Browser interface for inspecting a MirrorNeuron runtime through the REST API.

The Web UI shows runtime state, job history, job details, agent graphs, events, and raw manifest submission screens.

## Features

- Runtime dashboard with node and executor-pool status.
- Job list for active, completed, and pending jobs.
- Job detail pages with status, agent graph, agent table, and event stream.
- Dead-letter and communication-log inspection where available from the API.
- Raw JSON manifest submission.
- Development proxy to the local `mn-api` service.

## Demo and Screenshots

Screenshots or GIFs should be added here when the UI stabilizes:

```text
docs/images/web-ui-dashboard.png
docs/images/web-ui-job-detail.png
```

## Tech Stack

| Area | Tooling |
| --- | --- |
| Runtime | Node.js and npm |
| Framework | React |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Graph view | React Flow |
| Tests | Vitest |
| Packaging | npm package `mirrorneuron-web-ui` |

## Prerequisites

- Node.js and npm.
- A running MirrorNeuron API. The default local API is `http://localhost:54001/api/v1`.

## Installation

For local development:

```bash
npm install
```

The released-package installer installs the published npm package automatically when Web UI installation is enabled.

## Configuration

Vite exposes `MN_` environment variables to the browser build.

| Variable | Default | Description |
| --- | --- | --- |
| `MN_WEB_API_BASE_URL` | `/api/v1` | REST API base URL used by the browser. |
| `MN_WEB_API_TOKEN` | unset | Optional bearer token for protected API instances. |
| `MN_WEB_UI_HOST` | `localhost` | Development server bind host. |
| `MN_API_HOST` | `localhost` | Development proxy API host. |
| `MN_API_PORT` | `54001` | Development proxy API port. |

## Running

Start the API first:

```bash
mn-api
```

Start the Web UI in development mode:

```bash
npm run dev
```

Open:

```text
http://localhost:55173
```

## Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Testing and Linting

```bash
npm run lint
npm test -- --run
```

## Package Publishing

Stable SemVer tags publish to npm through GitHub Actions Trusted Publishing after the release workflow succeeds. Prerelease tags create GitHub prereleases and skip npm by default.

The npm package is:

```text
mirrorneuron-web-ui
```

## Deployment

The standard deployment path is `mn-deploy/install_new.sh`. It installs the npm package, copies the built `dist/` output into the local Web UI install directory, and starts it through `mn start`.

For custom deployments:

1. Build the app with `npm run build`.
2. Serve the generated `dist/` directory with a static file server.
3. Point `MN_WEB_API_BASE_URL` at the API path available to the browser.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| UI loads but API calls fail | Confirm `mn-api` is running and the dev proxy target matches `MN_API_HOST` and `MN_API_PORT`. |
| Protected API returns unauthorized | Set `MN_WEB_API_TOKEN`. |
| Graph page is empty | Confirm the selected job has graph data available from the API. |
| Build fails on type errors | Run `npm run lint` and `npm test -- --run` before `npm run build`. |

## Contributing

Keep UI changes aligned with the REST API contract. Add or update Vitest coverage for data loading, rendering states, and user actions.

## License

MIT.
