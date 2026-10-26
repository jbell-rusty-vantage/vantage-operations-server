# Environment inventory

This is the complete environment contract for the foundation. Supply values locally in ignored `.env` files and separately in the new Vercel project. No secrets are copied from sibling services.

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

The foundation requires no Google, RingCentral, CRM, sheet, queue, or cron credentials. Future features must add their actual requirements here before adding readers. The Owner's 56 production rates and surcharge groups are future database configuration, not environment variables.

## Planned pricing integration names

These names are specified for the future feature and have no foundation readers. Do not treat them as required for today's health checks.

| Name | Intended process | Purpose |
| --- | --- | --- |
| `MAIN_SERVER_AUTH_BASE_URL` | Operations server | Fixed trusted HTTPS main-server origin for existing `/api/v1/extension/auth/me` validation; never supplied by a browser request. |
| `OPERATIONS_ADMIN_SIGNING_SECRET` | Operations server and Admin server | Dedicated environment-specific HMAC key for operations Owner assertions. Server-only; distinct from existing registry signing keys. |
| `OPERATIONS_API_BASE_URL` | Admin server | Fixed operations origin for the new server-only pricing proxy; production origin is `https://vantage-operations-server.vercel.app`. |

Update the Admin inventory in its repository when implementing the proxy. The extension will need an explicit operations origin in its configuration and host permissions, but no server secret or copied token-signing key.
