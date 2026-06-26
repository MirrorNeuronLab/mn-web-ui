# MirrorNeuron Web UI

`mn-web-ui` is the React/Vite browser interface for inspecting MirrorNeuron
runtime state, job history, job graphs, events, dead letters, and raw manifest
submissions through `mn-api`.

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
