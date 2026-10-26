# Vantage Moving Operations and Analytics

A separate Express API deployed to its own Vercel project. The first planned feature is the Owner's transportation pricing calculator for the Granot browser extension.

This service uses the existing Atlas deployment and production database, `vantagemovers`. It does not replace `vantage-main-server`, migrate existing functionality, or create another production database. The current main server remains the owner of its existing domains and collections.

## Current state

The foundation is implemented: strict TypeScript, Express 5, the Vercel function entrypoint, JSON logging, security headers, explicit CORS, lazy pooled Mongoose connections, protected database readiness, and offline tests. No pricing API, production rate seed, authentication migration, or analytics jobs are implemented. No database collections are created by startup or health checks.

## Local development

For the isolated development database and API, start with [the local stack guide](docs/local-development.md). `pnpm dev:stack` never loads production `.env` files. Open `moving-pricing.code-workspace` in Cursor or VS Code to work across Operations, Extension and Admin. The [implementation team packet](docs/pricing/workspace/LEAD-AGENT.md) contains the lead prompt, ownership boundaries and verification checklist.

Use Node 22 and pnpm 10.13.1, matching the existing server's documented Node major and pnpm version.

```powershell
pnpm install
Copy-Item .env.example .env
# Fill the values in .env yourself.
pnpm dev
```

The API listens on `http://localhost:3001` to avoid colliding with the existing server. The public banner and liveness probe work before credentials are supplied. MongoDB connects only for a readiness check or a future feature that explicitly requests it.

```powershell
pnpm check
```

Tests inject configuration and mock database calls. They do not load `.env`, connect to Atlas, or write data. Use `TEST_MODE=true` and a test connection for any later live integration tests. Production continues to use `vantagemovers`; the test-mode safeguard is the same convention as the main server.

## HTTP surface

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /` | Public | Service banner |
| `GET /health` | Public | Process liveness, independent of MongoDB |
| `GET /api/v1/health/ready` | Server-only `x-api-secret` | Establish the MongoDB connection and run `ping` |

The readiness route returns 503 if auth or MongoDB is unconfigured or unavailable, and 401 for a missing or incorrect secret when configured. Responses do not expose the connection string, database host, or driver errors. Unknown routes return JSON 404s. Future feature routers install their own actor authentication and input parsing in `src/app.ts`; the diagnostic secret guards only readiness.

`x-api-secret` is an initial server-to-server boundary, not browser-extension authentication. Do not distribute its value in an extension or frontend. Before adding a pricing route, settle the existing Extension User session validation and Admin signed-actor contract in [the pricing plan](docs/pricing/PLAN.md).

## Deployment

1. Create a distinct Vercel project rooted at this folder. Do not link it to the main server's project or copy that project's `.vercel` folder.
2. Use Node 22 and the included `vercel.json`. It follows the current server's `api/index.ts` Express export, rewrite-to-`/api`, and `public` output directory pattern. The build runs typechecking. The single function has a 60-second budget; there are no cron or queue triggers.
3. Supply the values documented in [the environment inventory](docs/environment.md). Production uses the existing `vantagemovers` database. Scope Preview and Development credentials deliberately; do not test future writes against production.
4. Link the new project with `pnpm exec vercel link`. Deploy a preview with `pnpm exec vercel`, then production with `pnpm exec vercel --prod` when configured and ready. Automatic Git deployments are disabled, matching the existing server's manual deployment convention.
5. Verify `/health` and the authenticated readiness endpoint. Neither check writes data.

The scaffold was deployed on October 25, 2026 to the **Vantage** Vercel team (`vantage-4d3db9ef`), project `vantage-operations-server`: [production](https://vantage-operations-server.vercel.app), [Vercel project](https://vercel.com/vantage-4d3db9ef/vantage-operations-server). Public liveness is verified. MongoDB and auth credentials remain for the user to supply; protected readiness currently reports `API_AUTH_NOT_CONFIGURED`. The GitHub repository is [jbell-rusty-vantage/vantage-operations-server](https://github.com/jbell-rusty-vantage/vantage-operations-server), with `origin` pointing there and `main` as the primary branch.

See [deployment evidence](docs/DEPLOYMENT.md) and [database placement recommendation](docs/DATABASE-DECISION.md). The full planned feature contract starts at [the pricing specification](docs/pricing/SPECIFICATION.md), with [extension integration](docs/pricing/EXTENSION.md).

## Module boundaries

- `api/index.ts` exports the app; only `ops/dev-server.ts` listens on a port.
- `src/app.ts` owns HTTP composition. Future routes validate inputs and call services.
- `src/config.ts` owns environment parsing. Read `docs/environment.md` before adding names.
- `src/db.ts` owns the lazy Mongoose connection and readiness ping. Each warm instance uses a pool capped at five connections, with automatic index and collection creation disabled.
- `src/services/` will hold new Moving Operations and Analytics behavior as it is implemented. Do not import runtime modules from sibling repositories.
- Existing main-server collections and invariants remain under that server's ownership. New pricing collections will have explicit `moving_pricing_*` names, defined when persistence is implemented.

Deployment rollback is independent: disable or redeploy this Vercel project. No existing route has been redirected here and no data migration needs reversing.
