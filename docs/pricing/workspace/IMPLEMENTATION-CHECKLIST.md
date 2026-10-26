# Implementation checklist and release gates

Status: preparation only, 2026-10-25. No pricing runtime is implemented by this packet. Checkboxes require actual evidence, not planned commands. Full policy/API details remain in [SPECIFICATION.md](../SPECIFICATION.md) and [EXTENSION.md](../EXTENSION.md).

## Vertical slices

| Slice | Deliverable and acceptance | Dependencies / checks |
| --- | --- | --- |
| 0. Workspace and contract | Preserve status/baselines; read repository instructions; assign files; agree calculation/error/configuration/signature fixtures and explicit default-decision ledger | WORKSPACE.md; no production writes; no source HTML execution |
| 1. Offline calculation | Six inputs normalize correctly; exactly 56 base cells; minimum 300 CF; whole-load arithmetic; pickup-first single surcharge; zero differs from missing; stable breakdown | Pure tests before HTTP/Mongo; all decimal edges and rounding cases below |
| 2. Authenticated calculation boundary | Thin calculate route with mocked configuration source; extension authority validation and verified Admin actor; strict error/no-store/payload boundaries | Slice 1; forged/unavailable/revoked auth denies; no production keys needed |
| 3. Owner draft and preview | Explicit collection/index setup report/apply tooling; draft create retry identity, CAS save, immutable revision model; preview completeness, old/new and discontinuity findings | Schemas and owned collections; initially disabled/null control; no automatic index synchronization |
| 4. Publish and control | Atomic publication/revision/pointer/change transaction; expected versions; exact warning acknowledgement; idempotent unknown-outcome retry; activate and disable | Slice 3; dedicated nonproduction replica set; failure injection and concurrency proof |
| 5. Owner Admin workflow | Owner Setup entry, 8x7 editor, groups and collisions, draft/production distinction, preview, publish, separate enable, history/restore; exact signed server proxy | Slices 2-4; Admin signer/verifier conformance; current Mongo-backed Owner validation and same-origin mutation guard |
| 6. Extension read and display | DOM-only six-input parser, safe messages and frame candidates, authenticated operations client, explicit state machine, breakdown and freshness-checked copy | Slice 2 contract allows parallel work with synthetic responses; full integration needs active nonproduction revision |
| 7. Local integration and review | Run all required checks; test signed Admin edits through operations, extension complete/stale/error states and disable/rollback; document run/build/deploy commands | Slices 1-6; synthetic harness evidence plus separately labeled real-browser evidence |
| 8. Controlled release | Approved real configuration, production setup report/review, separate deployment, publish disabled, authorized pilot enable, rollback exercise, then broad access | Explicit gates below; local completion does not satisfy production approval |

## Required verification ledger

- [ ] Operations `pnpm check` passes with no `.env` loading or network calls in default tests.
- [ ] Mileage edges 100/300/750/1250/1800/2500/3000 at +/-0.0001, zero and open band; volume edges 300/500/1000/1500/2000/3000 at +/-0.0001; below-minimum and max bounds.
- [ ] All 56 positions; pickup/delivery/neither/both/same state; inactive pickup, explicit-zero pickup and missing selected pickup tier; duplicate active membership fails.
- [ ] Decimal-safe final-only half-up rounding including `300.5 * 0.0100 = 3.01`; max product; malformed/unknown/numeric/exponent/overprecision input rejection; leading-zero ZIP preserved.
- [ ] DOCX examples A/B pass as explicitly offline illustrative fixtures; no example production seed path exists.
- [ ] Nonproduction replica-set setup proves validators/indexes and transaction support; competing edits/publishes/disable, each transaction abort point and unknown commit retry leave no partial state.
- [ ] Same operation ID/body/actor returns saved success before stale-version rejection; changed actor/body conflicts. Preview acknowledgement cannot survive changed draft/control/hash.
- [ ] Calculation during publish returns coherent old/new revision; disabled/null/corrupt configuration never falls back to draft, old rates or zero success.
- [ ] Extension authority deadline/body bounds/no redirect/no positive cache; upstream 401 vs outage; changed account/email/role/token version, invalid JWT and role unions.
- [ ] Admin signature body/method/target/query/audience/timestamp tampering and replay behavior; stale current session/non-Owner/CSRF denied; old registry assertion rejected.
- [ ] Extension `pnpm compile`, focused `pnpm test -- <files>`, `pnpm build`, `pnpm build:firefox`; recheck actual package scripts before execution.
- [ ] Parser tests cover NBSP, decimals, ZIP5/ZIP+4, nested headings, pounds-only, missing units, duplicate/conflicting forms and misleading rate/summary/inventory/maps values; use invented data and inert scripts only.
- [ ] Frame/tab/navigation/document changes, out-of-order responses, mutation before calculate/copy, logout, visibility bootstrap, 401 refresh/failure, 403, timeout and malformed responses remove current-price/copy status.
- [ ] No workflow writes charge inputs, dispatches write messages or stores move snapshots/results in extension persisted preferences. Logs contain no private source/customer/auth data.
- [ ] Admin focused `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` and affected UI/E2E checks; distinguish existing baseline failures from regressions without suppressing either.
- [ ] Future pricing browser commands/results recorded separately from preparation checks in WORKSPACE.md. Preparation verified the existing extension on both a synthetic fixture and one live Charges form; the pricing parser/workflow still needs implementation and independent acceptance.
- [ ] Each worker reports actual files, commands, outcomes and unresolved issues; lead reviews cross-repo contracts and owns final integration.

## Commercial decisions and launch gates

These recommended defaults permit local implementation but are not approval to launch. Record Owner answer/date/evidence; leave unresolved gates open.

| Decision | Proposed default / required evidence | State |
| --- | --- | --- |
| Real rates | Owner supplies/approves all 56 base cells, every group's seven rates, membership and intentional zeros; no sample seeding | Open |
| Eligibility | Explicit Move Types, geography, Moving Carriers and seasons; one policy only if Owner agrees; extend eligibility contract if six inputs are insufficient | Open |
| Numeric/money | Nonnegative including zero CF/mileage, max 100000, four fractional places, rates max 1000.0000; USD, final half-up cents | Open |
| Roles | Extension Owner/Sales calculate, Customer Service-only denied, union permitted; Admin Dashboard Owner configures | Open |
| Timing and retention | Immediate calculation-time revision; display/copy only; no stored calculation history; retain published revisions/change evidence | Open |
| Supported pages | CF-mode-only first release; actual frame/variant evidence; displayed Distance authority/available precision and manual override policy confirmed | Open |
| Freshness | On-demand recalculation and stale suppression; agree maximum result age before launch; no claim of forever-current result | Open |
| Operational deployment | Correct Vercel project, trusted auth origins/signing keys/CORS/permissions, nonproduction transactions and authenticated health/denial proven | Open |
| Request budget | Verify actual edge capability/rules (proposed pricing 120/IP/min, Admin 60/IP/min), 429 behavior and shared-office NAT pilot; equivalent edge control if needed | Open |
| Pilot | Owner reviews whole-load downward jumps and manual expected outcomes; approved revision published disabled, separate authorized enable; disable and restore exercised | Open |

Deployment sequence: finish local/nonproduction checks; verify environment names/configuration without disclosing values; review explicit production collection setup; deploy operations to its existing independent project; deploy compatible Admin/extension only within separately authorized release scope; verify unauthorized denial; publish Owner-approved rates while disabled; enable only for authorized pilot; accept pilot before broad Sales access. Rollback first disables calculations, then reactivates an approved immutable revision using expected activation version and a new change record; code rollback is independent per service. Neither action rewrites history or touches main-server-owned data.
