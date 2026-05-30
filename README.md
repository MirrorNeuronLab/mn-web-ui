# MirrorNeuron Web UI

`mn-web-ui` is the React/Vite browser interface for inspecting MirrorNeuron
runtime state, job history, job graphs, events, dead letters, and raw manifest
submissions through `mn-api`.

## Quick Start

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Run local checks:

```bash
npm run lint
npm test -- --run
npm run build
```

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
- The default API base URL is `/api/v1`.
- Set `MN_WEB_API_TOKEN` when connecting to a protected API instance.
