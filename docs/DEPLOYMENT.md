# Deployment evidence

The independent scaffold is deployed. The pricing feature is specified, not implemented or enabled.

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
