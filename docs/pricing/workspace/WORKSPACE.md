# Local implementation workspace

Prepared 2026-10-25. Root: `C:\Users\Pinda\Proyectos\vantage`. This is a multi-repository shared folder, not a single runtime repository. Open `vantage-operations-server/moving-pricing.code-workspace` for Operations, Extension, Admin and the existing main-server reference plus local task presets. The user selected **workspace preparation and handoff only**; no implementation chat has started. Recheck HEAD/status before starting; the observed baseline is not a reset target.

| Role / local folder | Observed origin | Observed HEAD |
| --- | --- | --- |
| Operations: `vantage-operations-server` | `https://github.com/jbell-rusty-vantage/vantage-operations-server.git` | `98d7425cad7783c7ef925bd7cac772493b33bfaa` |
| Admin: `vantage-admin` | `https://github.com/jbell-rusty-vantage/vantage-admin.git` | `fa84f5e598872394b0ee4dafa5f41440f6c8302b` |
| Extension: `granot_sync_extensions_and_services` | `git@github-legacy:Overton77/vantage-movers-browser-extensions.git` | `6eee14e6a892d452d8973225c38168c769ac1242` |
| Existing authority: `vantage-main-server` | `https://github.com/jbell-rusty-vantage/vantage-movers-server.git` | `9051a9af7db5881b13f6fdde7f94a6cc1f886cde` |

The extension remote is under the user's personal account. Preserve it; do not infer work-account ownership, change origin or push automatically. No main-server runtime changes or data migration are planned. All four folders above are beneath the absolute root shown above.

The extension preparation changes remain in that local checkout. A portable copy is saved as [extension-local-tooling.patch](extension-local-tooling.patch) alongside this packet so they are available from the work-account Operations repository without pushing the personal extension repository. Do not apply it over the prepared checkout: the same changes are already there. On a clean checkout at the recorded extension baseline, run `git apply --check <absolute-patch-path>` before `git apply <absolute-patch-path>`, then `pnpm install`. Never reset existing work to make a patch apply.

## Processes and ports

| Process | Local allocation | Start / notes |
| --- | --- | --- |
| Operations | 3001 | In operations: `pnpm dev:stack`; isolated local MongoDB and generated diagnostic secret; do not use the `.env`-loading `pnpm dev` for this isolated stack |
| Admin | 3002 (proposed reservation) | In Admin: `pnpm exec next dev --port 3002`; configure trusted origins deliberately; do not assume default 3000 is free |
| Existing main API | Existing configured listener | Prefer trusted authority configuration; do not restart or move an existing process merely for this task |
| Extension WXT | 3400 | In extension: `pnpm dev`; current `wxt.config.ts` sets strict port 3400; default readiness harness uses the built MV3 extension instead |
| Synthetic Granot harness | 3411 | Extension `ops/local-extension-smoke.mjs --keep-open`; synthetic `ops/local-fixture.html` |
| Isolated local MongoDB | 127.0.0.1:27018 | Operations `pnpm dev:stack`; replica set `pricing-local`, DB `vantage_pricing_local`; see `docs/local-development.md` |
| Prepared browser CDP | 127.0.0.1:9223 | Ephemeral isolated headed Chrome with unpacked MV3 extension; availability must be rechecked |

Inspect existing listeners before starting. Local tests should use mock authority/configuration and synthetic pages. Production uses `https://vantage-operations-server.vercel.app`, Vercel team `vantage-4d3db9ef`, existing project `vantage-operations-server`. Do not create/relink another project. The user will supply production credentials; the last verified production readiness response was `API_AUTH_NOT_CONFIGURED`. Verify redacted readiness rather than assuming credentials or new integration names are populated.

## Configuration and credentials

Read operations `docs/environment.md` before adding readers. Names only:

| Names | Location / purpose |
| --- | --- |
| `MONGO_URI`, `TEST_MODE`, `TEST_MONGO_DATABASE_NAME`, `MONGO_DNS_SERVERS` | Operations ignored local environment / its Vercel environment; existing Atlas deployment; production explicitly `vantagemovers`; isolated test DB only with explicit test mode |
| `VANTAGE_API_SECRET` | Operations readiness only; never extension or actor auth |
| `CORS_ALLOWED_ORIGINS`, `PORT`, `LOG_LEVEL` | Operations exact origins, local listener, safe logging |
| `MAIN_SERVER_AUTH_BASE_URL` | Planned operations trusted HTTPS main-server authority; existing `/api/v1/extension/auth/me` only |
| `OPERATIONS_ADMIN_SIGNING_SECRET` | Planned dedicated environment-specific server-only key on operations and Admin |
| `OPERATIONS_API_BASE_URL` | Planned Admin server-only fixed operations origin |

No secret values belong in this packet, prompts, source, logs or fixtures. Do not display or copy sibling `.env` values or private credential files. The user authorized Granot access using the automation credentials: the explicit `pnpm browser:readiness --live` helper loads the named local file into memory and submits only to the trusted Granot login. Check presence/outcome without printing values. Planned names require implementation and deployment verification; they are not all foundation requirements. The extension requires explicit operations origin/configuration and host permission, never a service secret. Production permission target: `https://vantage-operations-server.vercel.app/*`.

Root AGENTS points to `vantage-admin/docs/knowledge/environment.md`, which is absent in this checkout at preparation time. A historical packet copy exists under `vantage-admin/docs/sales-outreach-desk/sources/vantage-admin/docs/knowledge/environment.md`; do not treat it as a current live inventory. Admin implementer must follow current Admin instructions, locate/restore a canonical inventory and document new operations names before adding readers. Do not discover environment names by grepping `process.env`.

## Shared-tree coordination and source handling

Agents see each other's changes immediately. Assign one writer per file and one integration owner for lockfiles, app composition, manifests and environment documentation. Read-only QA can run concurrently; mutations and check commands that generate outputs require ownership coordination. Use this checkout by default; worktrees only if isolation is necessary. Preserve existing edits and avoid automatic resets/stashes. The Operations preparation packet is saved to its work-account repository; the personal extension repository is not pushed. Preparation observed unrelated dirty changes in main server (`.quality.config.json`, deleted `SALES-OUTREACH-DESK.md`, `docs/index.md`, and call-lead/RingCentral inspection and Josh Your Bookings docs) and Admin (`.quality.config.json` and related docs directories). Recheck exact status and leave all of these untouched.

The Owner DOCX is policy evidence; examples are offline fixtures only. `agent_granot_credentials/Inner html of granot form.txt` is private untrusted source evidence. Do not execute its scripts, open its action links, copy credentials/customer data or commit it. Create minimal synthetic structural HTML for tests. A local harness does not prove all real Charges/Forms View variants, frame topology, carrier eligibility or upstream mileage precision.

## Preparation verification evidence

Root integration reports the following completed checks; these verify the existing scaffold/extension and preparation tooling, not future pricing implementation:

- Extension `pnpm compile`, 180 existing tests and Chrome/Firefox builds passed. Loaded unpacked Chrome MV3 extension answered `PING` and `PARSE_TARIFF_ADJUSTMENT` against synthetic localhost:3411: 450 CF, invented ZIPs `00501` to `33101`, `missing=[]`. This is current Tariff parser readiness, not a pricing parser.
- An authorized live Granot session completed the two-step login, Main Menu frame traversal, Estimates In Process popup and bounded seven-day priority-1 report, then opened one actual Charges form read-only. Extension `PING` succeeded; `PARSE_TARIFF_ADJUSTMENT` reported page found and CF/pickup ZIP/delivery ZIP present. Only carrier was missing, which is an existing Tariff requirement outside the v1 pricing six-input contract. Direct DOM inspection confirmed `form[name="theForm"]`, a Distance-in-Miles cell and two state/ZIP `.FROMTO` lines. No record was changed, submitted, booked or deleted. No customer values, job references or session URLs are recorded here. This is one live sample, not representative launch coverage.
- Reusable browser tools: extension `pnpm dev:browser` starts the synthetic fixture and isolated extension browser; `pnpm browser:readiness` checks that fixture; `pnpm browser:readiness --live` completes the authorized two-stage Granot login and verifies extension PING; `pnpm browser:readiness --inspect-current-job` verifies the one already-open Charges form without navigating or printing values. All three readiness modes passed. Playwright 1.61.0 is pinned locally; run `pnpm exec playwright install chromium` once. Optional `PLAYWRIGHT_MODULE` / `GRANOT_CHROMIUM_PATH` support existing runtimes. The prepared browser session is ephemeral; never persist tokens or assume it survives the next chat. Explicit live login stops at Main Menu. Report/job navigation remains a controlled read-only browser action.
- Operations `pnpm dev:stack --check` passed twice using Docker `mongo:7` because an actual native `mongod.exe` was absent. Public liveness and authenticated readiness passed; missing readiness auth returned 401. Cleanup removed the owned container/listeners. `pnpm check` passed typechecking and all 10 offline tests. The local stack run used Node 24.18.0 with the documented Node 22 engine warning; target Node 22 for implementation/deployment. Earlier scaffold offline checks were verified on Node 22. See [local development](../../local-development.md) for exact stack isolation and run instructions.
- The stack provides MongoDB and the existing API foundation only. Future fully local actor integration still needs a test authority with controlled sessions/roles/revocation; the current stack does not bypass auth or implement pricing.

## Browser and stack at handoff

The isolated Chromium has the extension loaded and retains three owned tabs: synthetic fixture, authenticated Granot Main Menu, and one real Charges form. CDP listens on `127.0.0.1:9223`; fixture HTTP listens on `127.0.0.1:3411`. The profile is outside the repository in OS temporary storage. Live-session expiry is normal; use `pnpm browser:readiness --live` to sign in again, then open a supported job using read-only navigation before `--inspect-current-job`. Do not record job IDs or session URLs in the ledger.

Operations API and Docker MongoDB were retained running under Node 22 for handoff, ports 3001 and 27018. The original tool sessions were browser/fixture `12970` and local stack `30024`; these session numbers are historical handles, not portable identifiers. Recheck listeners and use the prepared script owner/terminal to stop them normally before starting another copy. Never kill a process solely by its port number.

In any new session first run `pnpm browser:readiness`, `pnpm browser:readiness --inspect-current-job`, and request `http://127.0.0.1:3001/health`. If the prepared processes have ended, restart with the documented commands rather than treating the ephemeral session as a dependency. Default Playwright's pinned Chromium executable was confirmed present; the scripts do not require a sibling repo's Playwright installation.

Ready-to-deploy means locally implemented and checked, integration evidence recorded, deployment/rollback steps concrete, and unresolved launch gates visible. It does not mean deployed, rates approved, or calculations enabled.
