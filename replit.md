# Conscious Spending

A personal finance web app for young Indian professionals that tracks spending against a "Safe Limit" instead of a strict budget. Core philosophy: awareness, not restriction.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/conscious-spending run dev` — run the frontend (port set by PORT env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS, wouter for routing, React Query for data fetching
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — Single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (users, categories, categoryRules, transactions)
- `artifacts/api-server/src/lib/mockAATransactions.ts` — Mock Account Aggregator data layer (swap for real TSP here)
- `artifacts/api-server/src/lib/categorizationEngine.ts` — Three-tier categorization pipeline
- `artifacts/api-server/src/lib/safeLimitService.ts` — Safe Limit calculation logic
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/conscious-spending/src/` — React frontend

## Architecture decisions

- **Mock AA layer behind a clean interface**: `fetchAATransactions(userId)` is the only seam — swapping in a real Setu/FinBox/OneMoney integration is a one-file change.
- **Three-tier categorization**: Rule engine (exact VPA → regex) → P2P detector (≥2 heuristic signals required) → LLM stub (keyword-based, `callModel` is the swap seam). Credit transactions skip all tiers.
- **`ON CONFLICT DO NOTHING` on sync**: `bank_txn_ref` is the idempotency key. Re-syncing never overwrites USER_TAGGED entries.
- **Safe Limit color interpolation**: Green (0–87.5%), Amber (87.5–112.5%), Red (112.5%+) with smooth RGB interpolation within bands, not hard jumps.
- **P2P spend counts toward Safe Limit**: P2P transactions are categorized as UNCATEGORIZED but their amount is still included in the spend sum (only CREDIT is excluded).

## Product

- **Home screen**: Hero Safe Limit remaining amount, color-interpolated progress bar with limit tick, category breakdown, Sync button
- **Transactions screen**: All transactions grouped by date, category badges, P2P indicators
- **Inbox screen**: Quick-tag unresolved transactions with one-tap category assignment, clears to zero

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before starting the server or frontend
- Google Fonts must be loaded via `<link>` tag in `index.html`, NOT via `@import url()` in CSS (PostCSS + Tailwind v4 process order causes "import must precede all statements" errors)
- The demo user (id=1) is hardcoded — no auth system yet

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
