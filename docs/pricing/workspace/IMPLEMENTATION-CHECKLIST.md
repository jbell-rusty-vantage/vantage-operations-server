# Implementation checklist and release gates

Status: local implementation reconciled and verified 2026-10-26. User subsequently authorized deployment of Operations, Admin and the extension; Operations/Admin deployment and disabled/null collection setup completed; extension store release is tracked in RELEASE.md. Checkboxes record local evidence, not production approval. Full policy/API details remain in [SPECIFICATION.md](../SPECIFICATION.md) and [EXTENSION.md](../EXTENSION.md).

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

- [x] Operations `pnpm check`: typecheck and 25 tests passed; 10 opt-in tests skipped. Same default suite passed under Node 22.23.4.
- [x] All mileage/volume boundaries at +/-0.0001, below-minimum/max inputs, 56 matrix positions, surcharge precedence/zero/missing/inactive/same-state and active collisions.
- [x] Decimal-safe final half-up rounding, maximum product, strict six-input schema, leading-zero ZIPs and malformed/unknown/numeric/exponent/precision rejection. Source examples are offline fixtures only.
- [x] Local MongoDB 7 replica setup/validators/indexes and 10 Node 22 integration tests passed: CAS races, publication/disable race, abort after each write, response-loss retry, actor/body conflict, immutable restore, stable pagination and server-assigned group identity.
- [x] Calculation during publication returns coherent revision/version; disabled/null/corrupt state fails closed. Warning acknowledgement binds draft/control/configuration/sample inputs.
- [x] Authority deadline/body/no-redirect/no-cache, 401/outage, malformed response and role union tests. Operations calls current authority every calculation. Main-server account/email/token-version revocation is the existing authority's responsibility; these tests do not claim a new production revocation pilot.
- [x] Real Admin signer accepted by Operations; body/method/query/audience/timestamp/forged headers/old registry denied. Admin proxy tests verify current Owner, role denial and CSRF.
- [x] Extension compile, 222 tests across 26 files, Chrome/Firefox builds and synthetic browser smoke passed. Release packaging is recorded separately below/in the release runbook.
- [x] Parser ambiguity/units/NBSP/decimal/ZIP/frame and stale workflow checks passed; no writeback message, charge mutation, offline calculator or persisted move/result preferences introduced.
- [x] Admin typecheck, build and pricing lint passed. Full suite 1,217 passed/15 skipped; final focused pricing tests 9/9. Repository-wide lint retains six existing errors/five warnings in unrelated files.
- [x] Worker reports and cross-repository contracts reviewed. See [QA evidence](QA-EVIDENCE.md), [Admin guide](../../../../vantage-admin/docs/transportation-pricing.md), [extension guide](../../../../granot_sync_extensions_and_services/docs/transportation-pricing.md), and [run/release instructions](RELEASE.md).
- [x] Subsequently authorized release: Operations/Admin Ready, production disabled/null collection setup, authenticated readiness and denial/CORS probes passed; Chrome 0.3.4 uploaded successfully and pending review, live 0.3.3 retained. No rates seeded or calculations enabled.
- [ ] Authenticated interactive Owner browser flow and representative real Granot pricing pilot remain distinct from mocked browser/real local HTTP evidence. Earlier preparation's one live Charges sample is not comprehensive pricing acceptance.
- [ ] Actual production topology/failover and physical network partition during commit remain outside the local response-loss/replica suite.

## Original handoff reconciliation

The October 26 attachment `Agent_Pricing_Engine_Developer_Handoff(1).docx` has identical `word/document.xml` content to the original handoff (SHA-256 `e32bbe307c2f9e1fcf58e366311aefd9e34021641bf4f052cab1c90b4f925b80`). All twelve sections were read as inert document content. No calculator requirement was found missing from the derived contract. Its examples remain illustrative and are not production rates.

The user explicitly identified two unspecified follow-ups and asked to document them while completing everything else:

1. **Sales rep lock-in submission:** the form action, number being accepted, edit/override authority, persistence, retry semantics and what happens after a revision/input change are undefined. A displayed/copied calculation is not an accepted/locked quote. No lock-in operation is claimed or implemented.
2. **Final document write:** destination document/form fields, whether to write actual or billable cubic feet, whether the price means transportation only or a full quote, and overwrite/submission behavior are undefined. No final document or Granot charge field write is claimed or implemented. Source section 12 excludes quote/contract generation and ancillary fees.

The user authorized deployment of the otherwise complete read/display/copy feature, keeping these two deficiencies explicit. Exact writeback and role refinements can follow a separately defined contract.

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
