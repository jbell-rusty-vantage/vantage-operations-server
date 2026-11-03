# Deployment evidence

The independent pricing API is deployed. Production calculations remain disabled with no active revision or rates. The original scaffold evidence is retained below.

## Git checkpoint November 3 2026

The October 26 pricing implementation was still uncommitted on local `main`. Before adding Mongo Health, source SHA-1 checks against deployment `dpl_9dDFzQPizWVtDqLw5kf5v1E55Cuu` matched `src/app.ts`, `src/config.ts`, all six pricing runtime modules, `package.json` and `pnpm-lock.yaml` exactly. Production health returned 200 and unsigned pricing configuration returned 401. `pnpm check` passed typechecking and 25 offline tests (10 opt-in replica tests skipped). The Owner authorized committing and pushing this deployed baseline separately. No production rate configuration or enablement was changed by this checkpoint.

## Pricing deployment October 26 2026

- Final deployment: `dpl_9dDFzQPizWVtDqLw5kf5v1E55Cuu`, Ready, production alias [vantage-operations-server.vercel.app](https://vantage-operations-server.vercel.app).
- [Inspect](https://vercel.com/vantage-4d3db9ef/vantage-operations-server/9dDFzQPizWVtDqLw5kf5v1E55Cuu). Final build completed in 8 seconds; deployment/alias completed in 20 seconds. No TypeScript diagnostics in the final build.
- An initial feature deployment exposed Vercel's builder resolving the MongoDB `ObjectId` re-export as type-only. An explicit pinned `bson@7.2.0` dependency/import fixed the builder issue. It matches the BSON version used by MongoDB/Mongoose. `pnpm check` and all ten Node 22 local replica integration cases passed again before the clean deployment.
- Only `MONGO_URI` and `VANTAGE_API_SECRET` were transferred from the user-copied `.env`, using the same names and never printing values. Dedicated Admin signing key, authority URL, exact Chrome origin and `TEST_MODE=false` were configured separately. `.vercelignore` excludes secrets and local tooling data.
- Explicit production setup in `vantagemovers` first reported all four owned collections absent, then created validators/indexes and the disabled/null/version-0 control. No existing-domain collection was written; no rates/revisions were seeded. Atlas replica-set presence was verified.
- Production `/health`: 200; authenticated database readiness: 200 `ready`; unsigned pricing configuration and invalid bearer calculation: 401. Final deployment probes are recorded in the release ledger.
- Admin deployment `dpl_9SqULR8VgdtT6cwWcwEh7NC4jXkb` is Ready at [Owner pricing management](https://vantage-admin-rho.vercel.app/setup/transportation-pricing). The route redirects unauthenticated requests to login and its API denies them with 401/no-store. See the Admin guide for authenticated verification limits.

Remaining release/enablement work and the acknowledged lock-in/document-write gaps are tracked in [the runbook](pricing/workspace/RELEASE.md) and [unspecified workflows](pricing/UNSPECIFIED-WORKFLOWS.md).

## Historical scaffold deployment

| Field | Value |
| --- | --- |
| Date | October 25, 2026, America/New_York |
| Vercel team | Vantage (`vantage-4d3db9ef`) |
| Project | `vantage-operations-server` |
| Project ID | `prj_Kr0Dvn48Nx7vduHyVL4pjgOm3wYP` |
| Production alias | https://vantage-operations-server.vercel.app |
| Ready deployment | `dpl_41wnDuUCwYUdo9a5DfuwyPwfweVP` |
| Inspect | https://vercel.com/vantage-4d3db9ef/vantage-operations-server/41wnDuUCwYUdo9a5DfuwyPwfweVP |
| Runtime | Node 22, Express 5.2.1, TypeScript 6.0.3, pnpm 10.13.1 |

The final scaffold deployment completed its typecheck and Vercel Node build without TypeScript diagnostics. Public endpoint checks after deployment:

| Request | Observed response |
| --- | --- |
| `GET /` | 200, `service: vantage-operations-server` |
| `GET /health` | 200, `ok: true` |
| `GET /api/v1/health/ready` without credentials | 503, `API_AUTH_NOT_CONFIGURED` |

Local `pnpm check` passed strict typechecking and 10 offline tests on Node 24.18.0. The same 10 tests also passed under Node 22 using `pnpm dlx node@22 --import tsx --test src/app.test.ts src/config.test.ts src/db.test.ts`; Vercel built and ran on the declared Node 22 runtime. Database tests mock Mongoose; no Atlas connection or data writes were performed during verification. The initial deployment emitted extra Vercel builder typing diagnostics despite local typecheck success; explicit Express types and direct driver/type dependencies resolved those before the final deployment above.

## Next configuration

The user supplies `MONGO_URI` for the existing Atlas deployment and a server-only `VANTAGE_API_SECRET`, along with any desired exact CORS origins. See [environment.md](environment.md). Production resolves `dbName` to `vantagemovers` regardless of the URI path. No production rate values, pricing collections, or other integrations were seeded.

This project was linked independently; the existing server's Vercel project, environment and routes were not changed. `.vercel/project.json` is local ignored metadata, not a credential or committed deployment dependency. To recreate the link, use the team and project names above.

## Rollback

There is no data migration to reverse. Disable this independent deployment or redeploy the prior scaffold. No existing client traffic has been redirected to it. Future pricing publication and enablement will have their own rollback controls defined in the specification.
