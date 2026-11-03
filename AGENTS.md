# Discussion Group Manager - Agent Notes

Spec: React + TypeScript (Vite) frontend, Netlify Functions backend in `netlify/functions`, Neon PostgreSQL.

## Commands
- `npm run build` - typecheck (`tsc -b`) and build the frontend. Run before finishing a task.
- `npx oxlint` - lint.
- `npx netlify dev` - runs frontend and functions locally on port 8888 (Vite proxies `/api` there). Needs `netlify-cli` and a `.env` file.
- `node --env-file=.env database/migrate.mjs` - applies pending SQL migrations in `database/migrations/`.

## Conventions
- Shared server code lives in `netlify/lib/`. Only files in `netlify/functions/` become endpoints.
- Server-only secrets (`DATABASE_URL`, `SESSION_SECRET`) are never imported from `src/`.
- Add new migrations as `NNNN_description.sql`. Never edit an applied migration.
- `erasableSyntaxOnly` is on: no constructor parameter properties or enums.
