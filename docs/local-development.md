# Isolated local development

Run from `vantage-operations-server` after `pnpm install`:

```powershell
pnpm dev:stack
```

The launcher starts MongoDB and the Operations API, then verifies public liveness, authenticated database readiness, and denial without the readiness secret. It does not seed pricing, configure actor authentication, or start the extension fixture server. API: `http://127.0.0.1:3001`. The extension fixture origin allowed by CORS is `http://localhost:3411` (also `http://127.0.0.1:3411`). Start that fixture separately using the extension repository's local harness instructions.

Use Node 22 and pnpm 10.13.1. The launcher prefers a native `mongod.exe` under `C:/Program Files/MongoDB/Server/<version>/bin`; otherwise Docker Desktop must be running. The first Docker run downloads `mongo:7`. An installed MongoDB directory without its executable does not qualify as a native installation.

MongoDB publishes only `127.0.0.1:27018` and uses the single-node replica set `pricing-local`. The API explicitly selects `TEST_MODE=true` and database `vantage_pricing_local`; its URI is `mongodb://127.0.0.1:27018/vantage_pricing_local?replicaSet=pricing-local`. Native data lives under ignored `.local/mongo-data`; Docker data lives in the dedicated named volume `vantage-operations-pricing-local`. Docker's listener inside its container uses all interfaces so host publication can work; its host publication remains loopback-only. Neither backend uses an existing MongoDB service or production database.

The launcher refuses occupied ports 3001 or 27018 and an existing Docker container with its reserved name. It never kills their owners. Stop an earlier stack with Ctrl+C before starting another. Ctrl+C shuts down owned children and the owned Docker container; data is retained. Subsequent runs reuse that isolated dataset. Logs are ignored under `.local/`. This local MongoDB has no credentials and must remain loopback-only.

The API child receives an allowlist of operating-system variables plus explicit local configuration. The launcher does not load `.env`, inherit application credentials, or copy production secrets. A random readiness-only secret exists in process memory, is neither printed nor saved, and must never be used as extension actor authentication. Startup establishes the replica set but does not create pricing collections or seed rate values.

For a bounded verification that shuts down after success:

```powershell
pnpm dev:stack --check
pnpm check
```

Verified October 25, 2026 using Docker MongoDB 7 and Node 24.18.0 on this laptop: both health probes passed, unauthenticated readiness returned 401, and shutdown removed the container and both listeners. The stack was then started and verified under Node 22 using `pnpm dlx node@22 ops/local-stack.mjs` and retained for the handoff. Typechecking and all 10 offline tests passed. Normal shell Node 24 reports the repository's Node 22 engine warning; use Node 22 for implementation/deployment.

## Pricing verification

Pricing endpoints now exist, but the stack deliberately does not configure an authority or enable calculations. The live identity contract remains main-server `/api/v1/extension/auth/me` validation for each calculation. The nonproduction HTTP integration injects a mocked HTTPS authority into the actual application while exercising the real local Mongo store, Admin signer, publication and calculation routes. It never calls production identity services or bypasses the request's actor checks. The default test suite is offline; the opt-in transaction suite uses only `127.0.0.1:27018`, validates replica set `pricing-local`, and creates/removes random `vantage_pricing_qa_*` databases. See [commands and evidence](pricing/workspace/RELEASE.md). Keep server secrets out of the extension; readiness remains a diagnostic boundary only.
