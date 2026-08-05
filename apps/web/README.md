# Job Tracker dashboard

The dashboard is the React client for Job Tracker. For installation and normal use, follow the [root README](../../README.md).

## Development

Start the API in one terminal:

```bash
cd apps/api
uv run uvicorn app.main:app --port 3456 --reload
```

Start the Vite development server in another:

```bash
pnpm --filter web dev
```

Open <http://localhost:5173>. Vite proxies `/api`, `/docs`, and `/openapi.json` to the API on port 3456. A production build is emitted to `apps/web/dist`; FastAPI serves that directory at <http://localhost:3456>.

Run the dashboard tests and checks from the repository root:

```bash
pnpm exec vp run -F web test
pnpm exec vp run -F web typecheck
pnpm run build:web
```

Workspace-wide architecture and conventions are documented in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).
