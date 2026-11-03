# Independent pricing QA evidence

Reconciled and independently reverified locally on October 26, 2026, preserving the October 25 implementation. This evidence covers implementation checks, not production deployment, approved rates, commercial eligibility or live Granot coverage. No production credentials or real `.env` files were read. No deployment, repository push, production write or Granot charge write occurred.

## Independent files and commands

QA owns `tests/integration/` and this evidence document. Operations runtime, Admin and extension fixes remain with their implementation owners.

| Command from Operations | Outcome |
| --- | --- |
| `node tests/integration/local-replica-preflight.mjs` | Passed: retained loopback MongoDB `pricing-local`, snapshot/majority transaction commit and abort, collection validator and unique index enforcement |
| `pnpm check` | Passed typecheck and default suite: 25 passed, 10 explicitly skipped local tests, 0 failures; shell Node 24.18.0 emits documented Node 22 engine warning |
| `pnpm dlx node@22 --import tsx --test src/app.test.ts src/config.test.ts src/db.test.ts src/services/pricing/*.test.ts tests/integration/*.test.ts` | Passed under Node 22: 25 passed, 10 local tests skipped, 0 failures |
| `$env:PRICING_LOCAL_INTEGRATION='1'; try { pnpm dlx node@22 --import tsx --test tests/integration/transactions.test.ts } finally { Remove-Item Env:PRICING_LOCAL_INTEGRATION }` | Passed under Node 22: all 10 local tests, 0 skipped/failures |

The opt-in flag is a test-runner control only. Default tests never connect to MongoDB. The local suite hardcodes `127.0.0.1:27018`, verifies replica set `pricing-local`, allocates a random `vantage_pricing_qa_<UUID>` database per test and removes only that database afterward. It cannot select Atlas or `vantagemovers` from environment configuration. Existing API port 3001 and MongoDB container were inspected and retained; tests did not kill their owners. The HTTP integration uses an ephemeral loopback listener, synthetic key, and mocked fixed HTTPS identity authority.

Cross-repository signer checks load Admin's source optionally at runtime. They explicitly skip when the sibling Admin checkout is absent, keeping Operations' independent repository build/typecheck intact. Operations-only auth tests use an independent synthetic assertion fixture and do not import sibling runtime code. The reported workspace results above include the real Admin signer checks; they were not skipped here.

## Acceptance demonstrated

`domain-acceptance.test.ts` independently exercises every mileage edge and volume edge at ±0.0001, minimum CF, all 56 distinct rate cells, source examples A/B as synthetic fixtures, explicit-zero pickup precedence, missing pickup tier without delivery fallback, inactive/no surcharge, half-cent neighbor rounding, maximum product, leading-zero ZIPs and invalid wire/configuration inputs.

`admin-signing-conformance.test.ts` and `auth-conformance.test.ts` import the actual Admin signer. Its signature matches an independently constructed canonical byte string and is accepted by Operations. Body, actor, role, method, target, query order, timestamp, duplicate headers, ambiguous bearer/Admin credentials and the old registry signature are rejected. Boundary lifetimes of 30 seconds past and 5 seconds future are exercised. Authority calls use only the supplied bearer, constant path, configured HTTPS origin, no redirects, no cookies, no positive cache, bounded response and three-second deadline. Authority 401, outage, malformed success, duplicate/unknown roles, changing authority decisions, Customer Service-only denial and union-role access are covered. These adapter tests establish Operations' reliance on the current authority response; they do not replace the existing main server's own tests of JWT signature/email/role/token-version/account revocation.

`transactions.test.ts` demonstrates:

- Setup report performs no writes. Apply creates exactly the four owned `moving_pricing_*` collections with validators/indexes and disabled/null control.
- Failure injected after each of revision insert, control update, draft update and change insert aborts the entire transaction and leaves a byte-identical database snapshot.
- Competing draft saves have one winner. A controlled edit after publication's revision insert causes publication to abort without orphan revision/change or lost edit.
- Competing publications and disable/publication at the same expected activation version have one winner.
- Retrying a committed operation after discarding its response returns the same saved success before stale-version rejection. Changed body/actor key reuse conflicts. Draft creation is also actor-bound and idempotent. A different publication key cannot republish the published draft.
- Warning acknowledgement becomes stale when control changes. Separate enable, immediate enabled publication, immutable historical restore and activation-version increments preserve revision/change history.
- Calculation racing publication returns a coherent old or new revision/price/activation version. Missing active revision and hash corruption fail closed.
- A real signed HTTP sequence exercises Owner create/save/preview/publish, disabled first publication, same-key retry, separate enable, Sales calculation and disable. Unsigned configuration access is 401; a valid Sales actor cannot read configuration.
- Server-assigned surcharge group IDs survive revision copy and rename; fabricated IDs fail save. Historical revision names remain immutable. Direct Mongo updates above the `1000.0000` rate maximum fail validator enforcement.
- Newest-first revision pagination handles identical timestamps through the ObjectId tiebreaker, returns every revision once, omits configuration snapshots, and rejects malformed cursors.

The October 26 independent additions also distinguish missing base rates from explicit zero, and demonstrate that identical pickup/delivery state selects one pickup surcharge. The lead's request-correlation regression confirms pricing denials share the HTTP log/header request ID and hide detailed input errors until authentication succeeds.

## Review findings and resolutions

Independent review found that extension parser values with trailing fractional zeroes could disagree with canonical server echoes and be rejected as malformed. The extension owner canonicalized parser decimals. Review also requested strict response field shapes, which remain with the extension owner for final verification.

Admin review requested canonical timestamp/UUID signing guards and streaming response bounds; the Admin owner implemented them. Missing surcharge finding links used UUID paths while editor inputs used index paths; the Admin owner aligned the input IDs. Separate enable/disable now preserves an open draft and its local edits while invalidating preview.

Operations review identified that the initial collection rate regex admitted values above `1000.0000`, and that preview normalization rejected a complete batch when only one sample was invalid. The lead corrected both and added preview regression tests. The subsequent default and Node 22/local integration checks above include those changes.

## Evidence limits and open release gates

The unknown-outcome case proves successful-response loss followed by identical retry. It does not inject a physical network partition during MongoDB `commitTransaction`; driver unknown-commit handling still depends on MongoDB driver's transaction implementation. Publication concurrency is tested against a real single-node MongoDB 7 replica set, not production Atlas topology/failover.

Admin proxy/current Owner/CSRF tests and extension parser/workflow/browser evidence are maintained by their owners and must be read with the final integration ledger. QA reviewed their source boundaries, but this document does not claim a full authenticated Admin browser session or a live pricing call against real Granot. The extension owner reports a fully synthetic unpacked Chrome Read → Calculate → result → mutation/stale-copy smoke with both service origins mocked; no production call is implied.

Real rates, role/numeric policy approval, eligible Move Types/geography/carrier/season scope, representative live CF/pounds/frame evidence, mileage authority, maximum result age, production auth/CORS/permissions, edge request budget, Atlas deployment verification and Owner pilot acceptance remain open as specified in the implementation checklist. Calculations must remain disabled until separately authorized.

## Production UI verification attempt — October 26

After deployment authorization, QA attempted read-only verification of `https://vantage-admin-rho.vercel.app/setup/transportation-pricing` using an existing Owner browser session. Browser inventory exposed no browser automation provider and one native Firefox window. Selecting that returned Firefox window was stopped by the Computer Use runtime: “browser URL policy enforcement is not yet supported for the current Windows browser.” QA stopped computer interaction as directed. No navigation, login attempt, credential read, configuration request or pricing mutation occurred. An existing Owner session and the deployed page's authenticated rendering therefore remain unverified by this QA pass; this limitation does not establish an application failure.

## Polished Admin UI — synthetic browser acceptance

October 26 final frozen-source check: `node tests/transportation-pricing-visual.mjs <installed Chromium executable>` from Admin passed at 1440px desktop (850px section content) and 390px mobile. The dedicated harness bundles the actual `TransportationPricingSection`, panels and Owner role provider with actual globals/CRM/Setup/pricing CSS. It supplies a local fallback for Next's font variable and mocks only HTTP API responses; every non-loopback request is aborted. There is no production auth bypass route, credential use or remote write.

Both viewports demonstrate saving a changed draft, previewing its saved version, publication readiness after a change note, and invalidating preview/publication after another edit. A synthetic lost publication response disables duplicate publication; retry sends the identical command body and operation ID. A synthetic 409 save retains local rate edits and blocks unsafe saving. No browser page errors or page-level horizontal overflow occurred. Full-page screenshots cover first run, populated matrix, surcharge groups and preview at both sizes. The matrix intentionally scrolls within its own region on narrow screens.

Final screenshots are local temporary artifacts under `C:\Users\Pinda\AppData\Local\Temp\vantage-pricing-visual-S5tQkO`, with names `{desktop,mobile}-{empty,draft,groups,preview}.png`. Lead reviewed the visual direction; QA independently inspected the final mobile preview. This proves the local component and workflow with synthetic responses, not a real authenticated production Admin session or commercially approved sample rates.
