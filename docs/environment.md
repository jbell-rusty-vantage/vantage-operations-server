# Environment inventory

This is the environment contract for the foundation and implemented transportation pricing feature. Supply values locally in ignored `.env` files and separately in the Operations Vercel project. No secrets are copied from sibling services.

| Name | Default | Secret | Purpose |
| --- | --- | --- | --- |
| `MONGO_URI` | Unset | Yes | Existing Atlas connection. Needed only for database-backed work; production `dbName` is explicitly `vantagemovers`, regardless of the URI path. |
| `TEST_MODE` | `false` | No | Strict `true` or `false`. Selects the test database only when explicitly true, matching the main server's convention. |
| `TEST_MONGO_DATABASE_NAME` | `testvantagemovers` | No | Used only in test mode; cannot equal `vantagemovers`. |
| `MONGO_DNS_SERVERS` | Empty | No | Optional comma-separated DNS servers for MongoDB SRV resolution. |
| `VANTAGE_API_SECRET` | Unset | Yes | Server-to-server `x-api-secret` for readiness only. Missing configuration denies readiness with 503. Never browser-distributed and never an actor credential for future pricing routes. |
| `CORS_ALLOWED_ORIGINS` | Empty | No | Exact comma-separated origins allowed by CORS. An empty list grants no browser origins. CORS is not authentication. |
| `PORT` | `3001` | No | Local development listener only; integer 1 through 65535. Vercel uses the function export. |
| `LOG_LEVEL` | `info` | No | Pino `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`. Request logs omit headers, body, query strings, and raw errors. |

The service requires no Google, RingCentral, CRM, sheet, queue, or cron credentials. Future features must add their actual requirements here before adding readers. The Owner's 56 production rates and surcharge groups are versioned database configuration, not environment variables.

## Pricing integration

These names are read by the implemented pricing boundary. Missing values deny the corresponding authenticated pricing calls; health and diagnostic readiness retain their separate configuration. Never copy the main-server JWT signing key into Operations.

| Name | Process | Purpose |
| --- | --- | --- |
| `MAIN_SERVER_AUTH_BASE_URL` | Operations server | Fixed trusted HTTPS main-server origin for existing `/api/v1/extension/auth/me` validation; never supplied by a browser request. |
| `OPERATIONS_ADMIN_SIGNING_SECRET` | Operations server and Admin server | Dedicated environment-specific HMAC key for operations Owner assertions. Server-only; distinct from existing registry signing keys. |
| `OPERATIONS_API_BASE_URL` | Admin server | Fixed operations origin for the new server-only pricing proxy; production origin is `https://vantage-operations-server.vercel.app`. |

The Admin inventory is `vantage-admin/docs/knowledge/environment.md`. Use the same dedicated, environment-specific `OPERATIONS_ADMIN_SIGNING_SECRET` on Admin and Operations only. The extension has an explicit Operations origin and host permission, but no server secret or copied token-signing key. Configure exact extension origins in `CORS_ALLOWED_ORIGINS` at deployment.

The `pricing:setup` CLI reads this inventory from its explicitly supplied process environment, including optional `MONGO_DNS_SERVERS`; it does not load `.env`. It requires `--database=<configured database>` even in report-only mode. See [release/run instructions](pricing/workspace/RELEASE.md).

## Main-server environment mapping

On October 26 the user copied the main-server `.env` into Operations and authorized the required production transfer. `MONGO_URI` and diagnostic `VANTAGE_API_SECRET` retain their existing names and values. No bulk environment import was performed: unrelated main-server credentials/configuration remain unused by Operations and were not uploaded. `.vercelignore` excludes `.env` and `.env.*` from deployment.

Operations production explicitly sets `TEST_MODE=false`, `MAIN_SERVER_AUTH_BASE_URL=https://vantage-movers-main-server.vercel.app`, and the published Chrome extension origin in `CORS_ALLOWED_ORIGINS`. The new `OPERATIONS_ADMIN_SIGNING_SECRET` was generated separately and configured on Operations and Admin; it is not an alias for any existing session or proxy key. Admin's `OPERATIONS_API_BASE_URL` is `https://vantage-operations-server.vercel.app`. Local optional `MONGO_DNS_SERVERS` was used for setup connectivity, not blindly copied as a Vercel setting. Production always selects database `vantagemovers`.
