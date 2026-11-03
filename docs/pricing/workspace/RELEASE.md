# Local verification and release runbook

Reconciled October 26, 2026. The implementation remains uncommitted in three existing checkouts. The user subsequently authorized production deployment and reuse of the copied main-server environment values. Operations and Admin are now deployed, and only the four owned pricing collections were initialized, disabled/null. No production rate seed or enablement occurred. No repository was pushed. Preserve unrelated preexisting work when preparing commits.

## Reconciled implementation

| Repository | Implementation |
| --- | --- |
| Operations | `src/services/pricing/domain.ts` calculates with scaled BigInt and validates the six inputs/configuration; `preview.ts` reports completeness and discontinuities; `store.ts` owns drafts, immutable revisions, CAS, atomic publication, idempotency and controls; `auth.ts`/`router.ts` enforce actor and HTTP boundaries; `setup.ts` plus `ops/pricing-setup.ts` explicitly provision owned collections. App/config/package integrate these modules. |
| Admin | Owner Setup route/component, `server/operations-pricing/` protocol/proxy/validation, `app/api/operations-pricing/` current-session boundary, client request handling, setup navigation and environment inventory. See [Admin guide](../../../../vantage-admin/docs/transportation-pricing.md). |
| Extension | DOM parser, frame/observation messages, Operations API transport, workflow and popup workspace, role gate, origin/manifest and synthetic browser harness. See [extension guide](../../../../granot_sync_extensions_and_services/docs/transportation-pricing.md). |

Existing work was audited rather than reset. Reconciliation corrected ambiguous duplicate location headings, invalidated Admin review after production refresh, retained unknown command outcomes and retry identity, blocked competing mutations during unresolved draft creation, aligned pricing error request IDs with HTTP logs, and made setup honor the documented DNS configuration. Independent tests added group identity/history, validator limits and pagination coverage.

Operations owns exactly `moving_pricing_drafts`, `moving_pricing_revisions`, `moving_pricing_control`, and `moving_pricing_changes`. Explicit setup tests verify those four collections only. No main-server runtime file was changed for this feature; no writes to Lead, Booking, Cancellation, Extension User or main-server configuration collections are introduced. Rates live in Operations; neither browser client calculates prices or stores an offline rate table.

## Local commands

Use Node 22 and pnpm 10.13.1. From Operations:

```powershell
pnpm install --frozen-lockfile
pnpm check
# Start only if the documented stack is not already running:
pnpm dev:stack
```

The stack provides loopback MongoDB at port 27018 and the API at 3001. Inspect existing listeners/owners first; do not terminate another process because its port is occupied. It loads no `.env`, seeds no rates and does not supply actor credentials. In a second Operations terminal, run the independent, disposable-database integration:

```powershell
node tests/integration/local-replica-preflight.mjs
$env:PRICING_LOCAL_INTEGRATION = '1'
try {
  node --import tsx --test tests/integration/transactions.test.ts
} finally {
  Remove-Item Env:PRICING_LOCAL_INTEGRATION
}
```

The test controls cannot select Atlas or `vantagemovers`; they verify the local replica identity and clean up only their random QA databases. The HTTP test uses an ephemeral listener, actual Admin signer and Operations routes/store with a synthetic identity authority. Default `pnpm check` skips these ten opt-in cases. Final verification also ran both default and integration suites under Node 22.23.4 using `pnpm dlx node@22` because the normal shell runs Node 24.

From the extension checkout:

```powershell
pnpm compile
pnpm test
pnpm build
pnpm build:firefox
node ops/transportation-pricing-smoke.mjs
```

The browser smoke uses an isolated unpacked extension and synthetic child-frame Granot fixture. Its service origins are mocked: it proves read/calculate rendering, mutation staleness and disabled copy, with unchanged charge fields. It is separate from the real Operations HTTP integration and does not establish live Granot coverage.

From Admin:

```powershell
pnpm test
pnpm typecheck
pnpm exec eslint server/operations-pricing app/api/operations-pricing components/setup/transportation-pricing-section.tsx lib/transportation-pricing.ts tests/transportation-pricing.test.ts
pnpm build
```

For an interactive Admin session use a deliberately provisioned nonproduction Admin database/session, a trusted local Operations origin, and a dedicated matching server-only signing key; start `pnpm exec next dev --port 3002`. The existing Next build can load local environment under its usual behavior. No credentials are included here. Authenticated interactive Owner editing remains an integration gate; server rendering, proxy tests and signed HTTP tests passed.

## Verification outcomes

| Check | October 26 result |
| --- | --- |
| Operations `pnpm check` and Node 22 default suite | Typecheck passed; 25 tests passed, 10 explicit opt-in skips |
| Node 22 local replica transactions | 10/10 passed; CAS races, aborts, idempotency, publication/disable/restore, revision coherence, setup/validators and HTTP lifecycle |
| Extension | Compile; 222 tests/26 files; Chrome MV3 and Firefox MV2 builds; synthetic browser smoke passed |
| Admin | Typecheck/build/focused lint passed; full suite 1,217 passed and 15 skipped, final focused pricing suite 9/9 |
| Admin repository-wide lint | Six existing errors/five warnings in unrelated timeline, manual, reporting and Granot lifecycle files; not suppressed |

See [independent QA](QA-EVIDENCE.md) for precise limits: response-loss retry is tested, physical commit network partition/Atlas failover is not. Existing main-server revocation semantics are relied on through its current-user endpoint; this feature does not reimplement that authority.

## Executed production release October 26

| Component | Verified outcome |
| --- | --- |
| Operations | `dpl_9dDFzQPizWVtDqLw5kf5v1E55Cuu` Ready at [production](https://vantage-operations-server.vercel.app); final build has no TypeScript diagnostics |
| Admin | `dpl_9SqULR8VgdtT6cwWcwEh7NC4jXkb` Ready; [Setup → Transportation pricing](https://vantage-admin-rho.vercel.app/setup/transportation-pricing), Owner-only |
| Chrome extension | `0.3.4` upload `SUCCEEDED`, submitted `PENDING_REVIEW`; live version remains `0.3.3` / `PUBLISHED` until review. [Existing unlisted listing](https://chromewebstore.google.com/detail/granot-sync/mnfinkiglgagkfokimdnpkhlgemjnhfd) |
| Database | Four explicit pricing collections initialized in `vantagemovers`, control disabled, active revision null, activation version 0; no real or example rates seeded |
| Final probes | Health 200, authenticated Mongo readiness 200; missing readiness secret 401; unsigned pricing and invalid bearer 401. Error request IDs match HTTP headers. Published Chrome origin receives exact CORS allow-origin; untrusted origin receives none. |

Operations uses the existing environment names `MONGO_URI` and `VANTAGE_API_SECRET` from the user's copied file, with only those necessary values transferred. Trusted URLs, exact Chrome CORS origin and explicit production mode were configured; a separate new signing key is shared only by Admin and Operations. Main-server JWT keys and unrelated integration settings were not transferred. Deployment exclusion rules prevent local `.env` upload.

The release extension package contains the fixed Operations production URL and excludes localhost/127.0.0.1 host permissions and harness fixtures. Synthetic tooling now uses a separate `.output/chrome-mv3-synthetic` build; Chrome release and Firefox builds, 222 tests and compile passed. Publication used the repository's existing Chrome Web Store script and retained unlisted visibility.

Admin was packaged from tracked HEAD plus pricing-owned changes to avoid deploying unrelated dirty work. Unauthenticated page redirect and API 401/no-store were verified. A single standard login using documented local Owner credentials returned 401, so no authenticated production management read was claimed. Existing-browser inspection was blocked by Computer Use because URL-policy enforcement is unsupported for the available Firefox surface. These are verification limits, not permission bypasses; a valid Owner can use the deployed management page. No rates, draft or enable command was sent during production verification.

The first Operations feature deployment's builder warned on MongoDB's transitive `ObjectId` value export. Explicit `bson@7.2.0` import/dependency resolved it; default checks and all ten Node 22 replica tests passed again, then the clean final deployment above replaced it.

## Extension use and unresolved product choices

Proposed default: Extension User Owner or Sales can open Transportation pricing; Customer Service alone cannot, while Sales plus Customer Service can. Admin Dashboard Owner alone configures rates. Each calculation revalidates the current extension token through main-server `/api/v1/extension/auth/me`.

On a supported CF-mode Charges/Forms View, read the move, inspect all six values, calculate, and display/copy the server result and breakdown. Missing or ambiguous inputs block calculation. Navigation, input mutation, authorization loss or failed recalculation removes current-result/copy status. Pricing results and move snapshots are not persisted as preferences.

The original Owner DOCX was inspected as inert XML. It specifies internal agent results/display but no Granot destination or writeback action. This implementation does not write `I1PERCFLBS`, `I1TOTAL`, ancillary charges or submit a form. A future writeback must separately define field mapping, treatment of the 300 CF minimum versus actual CF, existing charges and permitted roles. No such policy was invented here.

The user separately identified a Sales rep lock-in submission and a final CF/price document write, and explicitly asked to document those missing workflows while completing the rest. See [the follow-up contract gaps](../UNSPECIFIED-WORKFLOWS.md).

## Release sequence and remaining enablement gates

1. Obtain approved real 56-cell base matrix and all surcharge groups/rates, including intentional zeros. Confirm eligible Move Types, geography, Moving Carriers and seasons; extend the six-input contract if the scope cannot be enforced from those inputs. Confirm numeric bounds, zero volume, four-place precision, USD half-up cents, role mapping, calculation-time revision, retention and display/copy behavior.
2. Complete the authenticated Owner browser flow and representative real CF/pounds/frame checks. Confirm whether displayed Distance is authoritative despite possible upstream rounding, and agree a maximum result age. Compare manual expected outcomes and whole-load downward jumps with the Owner.
3. Configure scoped production Mongo permissions and names from [the inventory](../../environment.md), trusted main-server HTTPS origin, a dedicated environment-specific Admin signing key on both servers, Admin Operations origin, exact CORS and packaged extension host permission. Verify values through redacted outcomes. No JWT signing-key copying or readiness secret in browsers.
4. With separately authorized production access, run `pnpm pricing:setup --database=vantagemovers` using an explicitly supplied scoped process environment. Review the read-only plan; then run the same command with `--apply`. This creates/validates only the four owned collections and indexes, with control initially disabled/null. Existing control is preserved. Never seed examples. Verify transaction support and index definitions on the actual deployment.
5. Deploy Operations to its existing Vantage project `vantage-operations-server`; deploy compatible Admin and publish the extension only within approved release scope. Do not change the extension's `Overton77` remote to a work account. Follow each repository's release process. Verify health, authenticated readiness, unauthorized denials, authority outages, exact signing/body tamper rejection and browser CORS.
6. Configure and verify edge request budgets (proposed 120/IP/min pricing and 60/IP/min Admin), 429/Retry-After behavior and shared-office NAT behavior, or an equivalent verified edge control.
7. Save/preview/publish approved rates while control remains disabled. Verify the published revision and separate enable control. Enable only for the explicitly authorized pilot, exercise disable and restore, and obtain Owner acceptance before broader Sales use.

## Rollback

Use Owner Disable calculations with current activation version, a new operation UUID and change note; retry the same command unchanged on unknown outcome. New calculations fail closed after disable commits; already returned prices cannot be recalled. For rate rollback, open an approved immutable historical revision, create its review draft, preview and restore the original revision with the current activation version and a new command/note. Restore preserves enabled state; keep disabled until approved to resume. Every successful control command increments activation version and appends change evidence. Never edit/delete published revisions or change history. Code rollback is independent for Operations, Admin and extension and does not migrate or erase main-server data.
