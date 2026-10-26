# Transportation pricing specification

Status: proposed engineering contract, 2026-10-25. The calculator, pricing collections, and routes described here are **not implemented**. [PLAN.md](PLAN.md) records the independent-service decision. [EXTENSION.md](EXTENSION.md) defines the browser integration.

## Authority and scope

The Owner's `Agent_Pricing_Engine_Developer_Handoff.docx`, sections 1-12, is the pricing-policy source. Its example rates are test fixtures, never approved production rates. The user subsequently selected this independent Express/Vercel service and the existing production `vantagemovers` database. Existing Lead, Booking, Cancellation, Extension User, configuration, and authentication ownership remains with `vantage-main-server`. Database placement and a dedicated scoped Mongo user are discussed in [DATABASE-DECISION.md](../DATABASE-DECISION.md); this contract targets the currently selected database until the Owner changes that decision. A separate database would require explicit backup/restore coverage before production.

Source requirements: 300 CF minimum; exact eight mileage bands and seven volume tiers; whole-load base rate; pickup-first active state surcharge without stacking; explicit zero distinct from missing; administrator-managed rates; agents cannot configure; decimal-safe prices; transportation only. Everything explicitly labeled **recommended default** below is an engineering/policy proposal requiring confirmation where listed in the release gates. This document does not imply that an unconfirmed commercial policy is approved.

No fuel surcharge, Binding Estimate Fee, packing, bulky items, pickup-service fees, expedited delivery, discounts, payment/deposit logic, customer ranges, quote/contract generation, geocoding, mileage calculation, inventory calculation, prediction, or historical-data migration belongs in v1.

## Inputs and normalization

All JSON property names use snake_case. Required calculation body has exactly six properties:

| Field | Contract |
| --- | --- |
| `volume_cf` | Actual cubic feet, decimal string |
| `mileage` | Unrounded miles, decimal string |
| `pickup_state`, `delivery_state` | String, trim then uppercase; accepted state allowlist |
| `pickup_zip`, `delivery_zip` | String, trim; five digits or `12345-6789`; preserve leading zeros |

**Recommended defaults:** USD; nonnegative CF and mileage including explicit zero; maximum CF `100000`, mileage `100000`; up to four fractional digits for both; base and surcharge rates nonnegative, at most `1000.0000` USD/CF with four fractional digits. Reject excess precision rather than silently rounding. Numeric wire values, exponential notation, separators, NaN, infinity, booleans, empty strings, signs, and unknown properties are rejected. Decimal grammar is `^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$`; surrounding decimal whitespace may be trimmed before validation. Responses render inputs canonically without unnecessary fractional zeros, rates with four fractional places, price with two.

**Recommended geography gate:** use the 50 US states plus DC for syntactic validation. Territories, armed-forces codes, and foreign addresses are unsupported until deliberately added. This is syntax, not commercial coverage approval. ZIPs are required for display/context only; no ZIP lookup, state/ZIP cross-validation, or ZIP pricing rule is implied. Do not infer a missing state from ZIP or treat `not_found` as valid. Eligible Move Types, carrier scope, seasons, and commercial geography require the explicit release decision below. v1 has one policy, not per-carrier or per-season routing.

## Stable keys and boundaries

Keys are fixed schema constants. Labels may change; keys and numerical bounds may not be edited in a draft. Decimal inputs are compared before any rounding.

| Mileage key | Exact condition for nonnegative mileage |
| --- | --- |
| `MI_0_100` | <=100 |
| `MI_101_300` | >100 and <=300 |
| `MI_301_750` | >300 and <=750 |
| `MI_751_1250` | >750 and <=1250 |
| `MI_1251_1800` | >1250 and <=1800 |
| `MI_1801_2500` | >1800 and <=2500 |
| `MI_2501_3000` | >2500 and <=3000 |
| `MI_3000_PLUS` | >3000 |

`billable_cf = max(volume_cf, 300)`; actual CF remains unchanged.

| Volume key | Exact billable CF condition |
| --- | --- |
| `MIN_300` | =300 |
| `CF_301_500` | >300 and <=500 |
| `CF_501_1000` | >500 and <=1000 |
| `CF_1001_1500` | >1000 and <=1500 |
| `CF_1501_2000` | >1500 and <=2000 |
| `CF_2001_3000` | >2000 and <=3000 |
| `CF_3001_PLUS` | >3000 |

For example 300.0001 CF uses `CF_301_500`, although its display label starts at 301. Mileage 300 uses `MI_101_300`, 300.0001 uses `MI_301_750`.

## Deterministic calculation

One service function owns normalization, tier resolution, lookup, surcharge selection, arithmetic, and the result. HTTP and Mongo adapters remain thin; the extension never reproduces this function or downloads rates for local execution.

1. Authenticate the caller and validate/normalize all six inputs.
2. Read one current control snapshot and the immutable revision it references; no active revision means unavailable. Check operational disablement and commercial scope.
3. Compute billable CF and select exactly one volume tier and mileage band.
4. Read the selected base cell. Missing/null is `MILEAGE_RATE_NOT_CONFIGURED`; explicit zero is valid.
5. Find an active group containing pickup state. If present select it, including a zero surcharge. Otherwise find an active delivery group. Neither means source `NONE`, surcharge zero, and null state/group fields. Inactive groups do not qualify. More than one active match is corrupt configuration, never first-match wins.
6. Read the selected group's rate for the selected tier. Missing/null is `STATE_SURCHARGE_NOT_CONFIGURED`. Never retry delivery to conceal missing pickup rates.
7. Add base and surcharge exactly. Multiply the combined rate by all billable CF; this is not marginal or stepped-tier pricing.
8. Round the product once to USD cents, half-up (**recommended default**). Return actual and billable volume, normalized locations, selected keys, components, revision, activation version, calculation time, and price.

Use scaled integers or an arbitrary-precision decimal library; JavaScript binary floating-point multiplication/`toFixed` is not the pricing algorithm. A concrete fixed-point implementation parses CF and rates to scale 10,000. Let `v` be billable CF units and `r` the sum of base and surcharge units. Exact product denominator is 100,000,000 dollars; for nonnegative values cents = integer division `(v*r + 500000) / 1000000`. Use BigInt internally and serialize decimal strings, never BigInt/unsafe JSON numbers. Mileage can use the same 10,000 scale for comparisons. No intermediate rate, volume, or product rounding. Persisted rates use canonical four-place strings; parse/validate on writes and reads. Zero must be tested by presence/null, not truthiness.

A larger volume can cost less when it crosses a tier and a lower rate applies to the whole load. Preserve the source formula. Publication preview must identify downward total-price jumps and compare the old/new matrices at tier edges; the Owner reviews these warnings, rather than the code imposing an unapproved monotonicity rule.

## Mongo ownership and schema

Only this service writes the following explicit collections. Mongoose startup keeps automatic collection/index creation off. A deliberate setup command creates validators/indexes in the selected database; default/report mode makes no writes. Production setup names `vantagemovers` explicitly; offline tests never load credentials.

### `moving_pricing_drafts`

One mutable full document per draft; no rate-per-document model. Fields:

- `_id`: ObjectId; `schema_version: 1`; `draft_version`: positive integer optimistic-lock counter; `operation_id` and `create_request_hash`: immutable draft-create retry identity bound to its verified actor.
- `base_revision_id`: ObjectId or null; `base_activation_version`: nonnegative integer captured on creation.
- `status`: `editing` or `published`; `published_revision_id`: ObjectId or null.
- `configuration`: the full configuration shape below. Drafts may have missing cells represented by explicit null; invalid strings, keys, state collisions, or duplicate IDs still fail save.
- `created_at`, `updated_at`: server UTC dates; `created_by`, `updated_by`: verified actor snapshot `{actor_type, actor_id}`. Clients cannot supply audit identity/time.

Configuration shape: `{currency:"USD", base_rates:{<all mileage keys>:{<all volume keys>:"4.0000"|null}}, surcharge_groups:[{group_id:"<UUID>",name:"Most Difficult",active:true,states:["MT"],rates:{<all volume keys>:"3.0000"|null}}]}`. For a new group in a draft PUT, send `group_id:null`; the service assigns a UUID within the successful draft CAS and returns it in the saved document. Existing group IDs must already belong to that draft; do not accept a client-invented UUID. IDs remain unchanged on rename/copy; removal from a later revision never alters an old one. Name trim, 1-80 characters; unique case-insensitive names recommended for clarity. State arrays unique and canonical sorted; active state membership globally unique within a configuration. Inactive groups may overlap, but reactivation must pass collision validation. All seven rates are required at publication even for inactive groups, consistent with the source's complete-group model. Zero is deliberately configured. Bound groups to 100 and serialized configuration to 256 KiB (**recommended resource limits**).

### `moving_pricing_revisions`

Immutable published snapshots: `_id`, `schema_version:1`, complete `configuration`, `configuration_hash` (SHA-256 of canonical sorted configuration JSON), `source_draft_id`, `source_draft_version`, `created_at`, `created_by`, `change_note` (1-500 characters). A revision is never patched or deleted by application routes. No mutable `active` flag on revisions. No example seed. Revision identity is an opaque ObjectId string in JSON; hash supports integrity/diff, not access control. Revision content is enough to reproduce the calculation under `schema_version:1`; changing arithmetic semantics requires a new algorithm/schema version and compatibility plan.

### `moving_pricing_control`

Exactly one singleton `_id:"transportation"`: `schema_version:1`, `active_revision_id` (ObjectId or null), `activation_version` (nonnegative integer), `calculation_enabled` (boolean, initially false), `updated_at`, `updated_by`. A null active revision is the initial unconfigured state. Disabling calculations preserves the active revision. Publish switches the pointer but does not implicitly enable calculations. This separates production-rate approval from operational enablement.

### `moving_pricing_changes`

Append-only successful control/publication history: `_id`, `operation_id` (UUID), `request_hash`, `operation` (`publish`, `activate`, `set_enabled`), verified `actor`, `created_at`, `change_note`, `previous_revision_id`, `revision_id`, `previous_activation_version`, `activation_version`, `calculation_enabled`, and saved small `response` for idempotent retry. No customer identity, ZIPs, tokens, or calculation payloads. Draft save metadata is sufficient for v1; no general event system. **Recommended retention:** keep published revisions and successful control changes indefinitely until the Owner defines retention; do not create a quote-history/results collection in v1. Calculation logs contain request ID, outcome code, latency and revision only, not six-input payloads.

Explicit indexes in addition to `_id`: drafts `{updated_at:-1,_id:-1}` and unique sparse `{operation_id:1}` for create retry identity; revisions `{created_at:-1,_id:-1}` and unique `{source_draft_id:1}` (one publish per draft); changes unique `{operation_id:1}`, unique `{activation_version:1}`, and `{created_at:-1,_id:-1}`. Embedded active-state membership cannot be protected correctly with a cross-group Mongo multikey unique index; validate the whole snapshot under the draft CAS and publish transaction. Enforce BSON types, required fields, enum/bounds and unknown-field rejection through application schemas plus feasible collection validators. No TTL on revisions/change evidence.

## Draft, publish, activation and races

Owner creates an empty draft (all 56 base cells null) or copies a revision. Saving replaces the entire configuration with compare-and-swap `{_id,status:"editing",draft_version:expected}` and increments version. A stale version returns 409 and the current version; do not silently overwrite. Published drafts are read-only; edit via a new draft.

Publish takes `expected_draft_version`, `expected_activation_version`, an `operation_id`, and `change_note`. Validate full matrix and all groups; capture an explicit warning acknowledgement for downward jumps if preview reported them. In one Mongo transaction with snapshot reads and majority write concern: read/edit-lock the exact draft version; verify it is editing; validate; insert immutable revision; CAS singleton control at the expected activation version to the new revision and version+1; mark draft published and increment draft version; insert successful change evidence. Any failed CAS or audit insert aborts everything. A concurrent edit/publish or competing Owner publication has one winner; loser gets 409 and must reload/review. Mongo transaction transient retries may repeat with identical command inputs; never rebase a stale expected version automatically. Replica-set/transaction support is a release prerequisite.

Every control mutation increments activation version, including enable/disable and reactivation of an older revision. Rollback means `activate` an existing complete revision with CAS and a new change record; it never rewrites published history. Activating is immediate after commit; no future effective dates, move-date selection, background schedules, or multiple active policies in v1. Timing policy is a recommended default awaiting approval.

Idempotency covers publish/activate/set-enabled: globally unique `operation_id` UUID and canonical command+actor hash. On duplicate, return saved success only when actor and request hash match; reuse with different input returns 409 `IDEMPOTENCY_CONFLICT`. If commit outcome is unknown, client retries the same command/key. Lookup a committed operation before stale-version rejection so a successful retry returns success. A second publish using another key against an already-published draft returns conflict. Never retain a failure as a successful operation.

Calculation reads the singleton from primary with majority concern, then loads the referenced immutable revision by ID. A simultaneous publish may yield either complete revision, never a blend; pointer read is the calculation's configuration selection point. Return its activation version even if publication finishes before the response. Disablement affects calculations beginning after control commit; it cannot recall already-running responses. No mutable in-process active-pointer cache in v1. Missing referenced revision/hash mismatch is a 503 configuration failure, never fallback to draft/example/older values.

## Proposed API

All routes below are new and unimplemented. Prefix `/api/v1/pricing`; JSON responses have `{ok:true,data:...}` or `{ok:false,error:{code,message,fields?},request_id}`. Auth precedes detailed input/configuration error disclosure. Errors never include tokens, Mongo driver text, or credentials. Set `Cache-Control: no-store`; body limit 256 KiB for configuration and a smaller calculation route limit. Configure CORS with exact extension/Admin origins; CORS is not authentication.

| Method/path | Actor | Behavior |
| --- | --- | --- |
| `POST /calculate` | Eligible Extension User or verified Owner | Current production calculation; no arbitrary revision selector |
| `GET /configuration` | Owner | Control plus current snapshot; no production rates exposed to Sales |
| `GET /revisions?cursor=...&limit=20` | Owner | Stable newest-first metadata; max 100; cursor includes date/id |
| `GET /revisions/:revision_id` | Owner | Immutable snapshot |
| `POST /drafts` | Owner | `{base_revision_id:null,operation_id:"<UUID>"}` or existing revision ID; returns draft version 1 |
| `GET /drafts/:draft_id` | Owner | Draft/configuration/version |
| `PUT /drafts/:draft_id` | Owner | `{expected_draft_version,configuration}` full replacement |
| `POST /drafts/:draft_id/preview` | Owner | `{expected_draft_version,inputs:[<six-input object>]}`; max 100; draft calculations clearly nonproduction; errors per input and completeness/diff warnings; no mutation |
| `POST /drafts/:draft_id/publish` | Owner | Atomic publication command described above |
| `POST /activate` | Owner | `{revision_id,expected_activation_version,operation_id,change_note}` |
| `POST /enabled` | Owner | `{calculation_enabled,expected_activation_version,operation_id,change_note}` |

Preview must return the draft version and configuration hash; publish acknowledges that exact preview hash if warnings require acknowledgement (`acknowledged_warning_hash`). It rechecks warnings inside the transaction; stale acknowledgements fail 409. Preview is optional when there are no warnings. Completeness failures cannot be acknowledged away. Configuration management belongs in Admin Dashboard; the extension is display/copy only.

Calculation example (illustrative revision B rates):

```json
{"volume_cf":"725","mileage":"1240.4","pickup_state":" fl ","pickup_zip":"33401","delivery_state":"MT","delivery_zip":"59715"}
```

```json
{"ok":true,"data":{"revision_id":"6a0000000000000000000001","activation_version":3,"schema_version":1,"calculated_at":"2026-10-25T20:00:00.000Z","currency":"USD","actual_cf":"725","billable_cf":"725","mileage":"1240.4","pickup_state":"FL","pickup_zip":"33401","delivery_state":"MT","delivery_zip":"59715","mileage_band":"MI_751_1250","volume_tier":"CF_501_1000","base_rate_per_cf":"3.2000","surcharge_source":"DELIVERY","surcharge_state":"MT","surcharge_group_id":"c581a221-d1f8-49cd-9872-7fcc06ae8072","surcharge_group_name":"Most Difficult","surcharge_rate_per_cf":"0.5000","final_rate_per_cf":"3.7000","transportation_price":"2682.50"}}
```

Publish example:

```json
{"expected_draft_version":4,"expected_activation_version":2,"operation_id":"87a9d6aa-0772-464a-8966-d69403002dc1","change_note":"Owner approved production rates"}
```

```json
{"ok":true,"data":{"revision_id":"6a0000000000000000000001","activation_version":3,"draft_version":5,"calculation_enabled":false}}
```

Error example:

```json
{"ok":false,"error":{"code":"INVALID_INPUT","message":"Check the move inputs.","fields":[{"path":"mileage","code":"DECIMAL_PRECISION","message":"Use at most four decimal places."}]},"request_id":"req_example"}
```

| HTTP | Stable code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Missing/invalid/unknown fields or malformed IDs/decimal values |
| 401 | `UNAUTHENTICATED` | Missing, invalid, expired or revoked caller session |
| 403 | `FORBIDDEN` | Valid actor without required role/scope |
| 404 | `DRAFT_NOT_FOUND`, `REVISION_NOT_FOUND` | Owner entity lookup failed |
| 409 | `DRAFT_VERSION_CONFLICT`, `ACTIVATION_VERSION_CONFLICT`, `DRAFT_ALREADY_PUBLISHED` | Reload and review concurrent changes |
| 409 | `IDEMPOTENCY_CONFLICT`, `PREVIEW_ACKNOWLEDGEMENT_STALE` | Key reuse or stale reviewed warnings |
| 422 | `CONFIGURATION_INVALID` | Incomplete publication, unknown keys, state collision, bad group/rate; include safe field paths |
| 422 | `MOVE_NOT_SUPPORTED` | Move outside explicitly approved commercial scope |
| 429 | `RATE_LIMITED` | Per-actor/request protection; include Retry-After |
| 503 | `PRICING_NOT_CONFIGURED`, `PRICING_DISABLED` | No approved revision or operationally disabled |
| 503 | `MILEAGE_RATE_NOT_CONFIGURED`, `STATE_SURCHARGE_NOT_CONFIGURED` | Selected production configuration cell absent; never zero fallback |
| 503 | `CONFIGURATION_CORRUPT`, `DEPENDENCY_UNAVAILABLE`, `AUTH_UNAVAILABLE` | Integrity, database, or auth authority unavailable; fail closed |

Request-size overflow returns 413 `PAYLOAD_TOO_LARGE`; unexpected failures return 500 `INTERNAL_ERROR` with request ID. Corrupt duplicate active membership is `CONFIGURATION_CORRUPT`. Valid publication normally prevents missing-rate runtime errors, but defensive reads must retain the Owner's required codes.

## Preview, pagination and request budgets

Preview returns `{ok:true,data:{draft_id,draft_version,configuration_hash,base_revision_id,active_revision_id,activation_version,complete,findings,warnings,warning_hash,results}}`. Each finding is `{code,path,message}`; each warning is `{code,mileage_band,volume_boundary,old_price,new_price,message}` with decimal price strings and nullable old price when no active revision exists. Each result is `{input_index,ok:true,data:<calculation breakdown>}` or `{input_index,ok:false,error:{code,message,fields?}}`. Preview results additionally carry `production:false`, `draft_id` and `draft_version`, and never masquerade as a published result. A completeness error leaves `complete:false`; valid sample rows may still be shown. Unknown currency/keys or malformed draft input fail validation before calculation.

`warning_hash` is SHA-256 of canonical JSON `{schema_version:1,draft_id,draft_version,configuration_hash,active_revision_id,activation_version,inputs,warnings}`. Canonical JSON recursively sorts object keys; arrays preserve documented order. Normalize sample inputs first, sort warnings by code/mileage key/volume boundary, and encode strings/booleans/null as JSON without whitespace. The publish request supplies the same reviewed `preview_inputs` (max 100) and `acknowledged_warning_hash` when warnings exist. Within the transaction recompute preview/diff against the exact expected control/draft versions and these inputs; a mismatch is `PREVIEW_ACKNOWLEDGEMENT_STALE`. Rate discontinuity warnings are generated for every mileage band/tier edge whether or not sample inputs cover them, using the maximum supported precision points immediately before/after the boundary and the minimum-volume point. Example: 500 CF at 4.0000 costs 2000.00, while 500.0001 CF at 3.0000 costs 1500.00: show a downward jump warning. Negative rates and state collisions are blocking findings, never acknowledgement warnings. Recompute warnings on publish even if no preview was requested; required acknowledgement cannot be bypassed by omitting preview fields.

Revision pagination uses an opaque base64url JSON cursor `{created_at,id}` validated against strict date/ObjectId schemas; sort `created_at DESC,_id DESC` and query strictly less than the cursor pair. `limit` is integer 1-100 (default 20), and the response is `{items,next_cursor}`. No offset scans or total-count query. Cursor pagination is not a snapshot across new publications; new rows appear after refresh, and previously paged immutable rows remain stable.

**Recommended deployment request budget:** configure Vercel firewall rate limiting for the `/api/v1/pricing/*` prefix at 120 requests/IP/minute; Admin routes at 60/IP/minute. Verify available plan capability during deployment, record actual configured rules, and return 429 with Retry-After where supported. Do not pretend an in-memory Vercel function counter provides a global per-actor guarantee. No custom distributed per-actor limiter is required for v1; authentication, payload/sample/group bounds, explicit calculation action, client single-flight and the edge IP budget bound initial usage. Observe pilot volume/denials and add a shared per-actor limiter only if evidence warrants it. Shared-office NAT limits must be tested before broad Sales rollout. If the Vercel plan cannot supply the rule, select and verify an equivalent edge control before release rather than silently leaving this requirement unimplemented.

## Admin Dashboard workflow

Add an Owner-only Transportation pricing entry in Admin Setup. Its server proxy calls operations directly. Show active revision, last change, enabled/disabled state, and one explicit Edit action that creates a draft from the active revision (or an empty draft at first setup). Keep production view visually distinct from Draft; an unsaved/saved draft never changes agent prices.

The editor displays eight mileage rows by seven volume columns, the 56-cell USD/CF grid, with exact boundary help text and four-decimal-capable inputs. Empty means missing; typed zero remains zero. Group editor supports create/rename, active toggle, state multi-select and seven tier rates. Show a state's conflicting active group before save; activation that causes a collision is blocked. Explain pickup precedence and show zero pickup surcharge examples. Save performs a full draft replacement with the current version, then updates that version from the response. For network-unknown save status reload the draft; do not replay with an automatically advanced version.

Preview shows missing-cell findings linked to grid/group inputs, sample move breakdowns, whole-load tier discontinuities and old/new rate comparisons. A warning example must show that adding CF may reduce total transportation price. Owner acknowledges the exact current warning report, adds a change note, and presses Publish. Disable Publish while findings remain or draft changes after preview. Publish records the revision and switches the active pointer while preserving enabled state. First publication remains disabled until the Owner separately presses Enable calculations. Subsequent publications to an enabled control become effective immediately; show this consequence before the action.

On 409, retain the Owner's local unsaved data, show that another change was saved, and offer reload/diff or copy changes into a new draft. Never automatically overwrite/rebase/publish. Unknown control outcome retries the same operation ID/body; definitive conflict requires a new reviewed command. Disable calculations is a separate Owner action with change note and expected version. History opens immutable revisions; Restore activates the selected complete snapshot with a new note/CAS/change record, preserving enabled state. Create a temporary draft copied from the historical revision for review/preview, then activate that immutable historical revision with the separately reviewed current activation version. Show restored rates in preview before restoration and state that restoration affects new calculations immediately. No revision is deleted and no displayed/copied historical result is retroactively rewritten.

## Authentication and role boundary

Observed existing authority: [Extension Users](../../../vantage-main-server/docs/knowledge/services/extension-users.md), `src/auth/extension/session.ts` and `tokens.ts`. Main server owns login/refresh and `extension_users`. Access claims include subject, email, roles, token version and expiry; `getExtensionUserFromAccessToken` verifies signature then checks a current active stored user and matching email, role set and token version. Password/role/email changes revoke older sessions; deletion removes access. Merely verifying a matching JWT secret is insufficient.

**Selected extension integration:** operations forwards the supplied Bearer access token to the **existing** main-server `GET /api/v1/extension/auth/me` on every calculation. That route already calls `getExtensionUserFromAccessToken` and responds `{ok:true,data:{user:{id,email,roles}}}`. No new main-server endpoint or secret sharing is required. Main server remains the login/refresh authority. Operations never verifies tokens using a copied signing key or reads `extension_users` directly.

The adapter uses one configured trusted HTTPS base URL, the constant `/api/v1/extension/auth/me` path, no redirects (`redirect:error`), no forwarded cookies/actor/service-secret headers, and a three-second abort deadline. Never accept a URL from the browser or retry against another host. Limit the response body to 16 KiB and validate JSON at runtime: literal `ok:true`, `data.user.id` a 24-hex ObjectId string, valid nonempty email string, and a nonempty unique array of the exact `owner`, `sales`, `customer_service` roles. Malformed success, network/TLS/timeout, unexpected redirect, or non-401 upstream error is 503 `AUTH_UNAVAILABLE`; upstream 401 is 401 `UNAUTHENTICATED`. Never expose the upstream error body. No positive-result cache. Keep only `{actor_type:"extension_user",actor_id:id,roles}` for downstream authorization; do not return the user's email/identity in pricing responses. Unknown future role values fail closed pending contract update. Bound incoming Bearer tokens to 8 KiB and reject ambiguous/multiple authorization credentials. Existing logout only acknowledges logout; local token removal is not server-side revocation. Existing token-version/account changes remain the actual revocation behavior.

**Selected Admin boundary (new operations integration):** the Admin Dashboard adds a server-only pricing proxy, using its existing `getAdminFromAccessToken`/current Mongo-backed session validation on every request and requiring the resulting current role `owner`. Do not rely solely on edge route guards or decoded cookie claims. Reject cross-origin mutation requests with the Admin's same-origin/CSRF checks. The proxy strips all incoming actor/signature headers, validates an explicit pricing route/method allowlist, serializes the validated outbound body once, and signs those exact bytes. Browser cookies stay in Admin; only the server-issued assertion crosses to operations. No main-server changes are needed.

The existing registry signature in `trustedActorCanonical.ts`/Admin `proxySigning.ts` signs seven newline-separated fields (actor ID, normalized email, role, timestamp, request ID, method, path) using HMAC-SHA256. It has no operations audience or body digest, so do not reuse that assertion unchanged. Implement a separate operations signer/verifier using a dedicated server-only key shared by Admin and operations, documented in both environment inventories before implementation. Proposed configuration names are `OPERATIONS_ADMIN_SIGNING_SECRET` on both, `OPERATIONS_API_BASE_URL` on Admin and `MAIN_SERVER_AUTH_BASE_URL` on operations; these are planned names, not present foundation readers. Use independent keys per deployment environment and fail closed if absent.

Concrete wire assertion: headers `x-vantage-operations-actor-id`, `x-vantage-operations-role`, `x-vantage-operations-timestamp`, `x-vantage-operations-request-id`, `x-vantage-operations-signature`. Role must be exactly `owner`; actor ID 24 lowercase hex; request ID a UUID generated by the proxy; timestamp canonical base-10 Unix milliseconds. Reject CR/LF in every component. Signature is lowercase hex HMAC-SHA256 over these UTF-8 lines, with no trailing newline: `vantage-operations-admin-v1`, `transportation-pricing`, actor ID, role, timestamp, request ID, uppercase method, exact outbound request target (path plus canonical query), lowercase hex SHA-256 of the exact body bytes (empty byte string for GET). The proxy and verifier use an explicit route allowlist; no duplicate query keys, fragments, dot-segments or trailing-slash variants. Sort allowed query keys by ASCII before sending/signing. Verification compares decoded 32-byte signatures in constant time, requires the expected fixed audience/version and a timestamp no older than 30 seconds or more than 5 seconds in the future, and verifies method/target/body before parsing/mutating. Capture raw body bytes before JSON parsing for this check. Never accept unsigned role/actor values or the old registry assertion on pricing routes.

Replay protection stays within existing domain controls: every control command has its signed `operation_id`, actor/request hash, unique successful change record and expected activation version; every draft PUT has its expected draft version; a replay therefore returns the saved identical result or conflicts instead of applying twice. Draft creation additionally requires `operation_id` UUID; store it on the draft with actor and request hash and a unique sparse index, returning the existing draft only for an identical actor/body. Draft create/save and control writes require a freshly checked Admin session at proxy signing time; an already-issued assertion can remain usable for at most its 30-second verification lifetime. Reads/preview are side-effect-free and may replay within that window. No general nonce database/Redis is required. This bounded revocation window is explicit; if immediate remote revocation of issued assertions becomes a requirement, add an authority callback before release rather than claiming the signature supplies it. Auth conformance tests remain an implementation gate.

**Recommended access defaults:** Extension User `owner` or `sales` may calculate; `customer_service` alone may not. Roles are unioned, so Sales plus Customer Service may calculate. Config read/write/preview/publish/enable/rollback requires a verified Admin Dashboard Owner; Admin, manager, Sales, Customer Service and possession of `x-api-secret` alone grant none. Extension Owner calculation access does not automatically become Admin configuration access. Owner handoff says authorized administrators; restricting configuration to Owner is a proposed mapping to Vantage roles requiring confirmation. Never trust client role/actor headers. Never ship server service secrets in the browser. Shared Mongo access alone conveys no authorization. The foundation readiness secret remains diagnostic only.

## Acceptance and implementation gates

Build tests offline around the pure calculator and mocked adapters, then a dedicated nonproduction replica-set suite for transaction behavior. Do not run automatic tests against production or load real `.env`.

Required deterministic tests:

- Every mileage upper edge 100,300,750,1250,1800,2500,3000 at edge and +/-0.0001; 0 and final open band. No rounded selection.
- Actual CF 0,75,299.9999,300 share billable 300; every volume edge 300,500,1000,1500,2000,3000 and +/-0.0001; maximum accepted input and above it.
- All 56 cells selected by representative pairs; exact stable keys; rate zero versus absent/null; unknown/missing matrix keys rejected at publish.
- Pickup only, delivery only, neither, both, same state, inactive pickup group, explicit-zero pickup vs positive delivery, missing selected pickup tier vs configured delivery, active membership collision.
- Worked source A: 75 CF,2429 miles, MT pickup, fixture base 4 + surcharge 3 =>2100.00. Source B:725 CF,1240 miles,FL to MT,fixture 3.2+0.5=>2682.50. Never seed these values in production.
- Half-cent tie:300 CF  x 0.00005 is not representable under four-place rates; use 300.5 CF  x 0.0100=>3.005 dollars=>3.01. Neighboring products below/above tie round correctly; no intermediate rounding; maximum product does not overflow.
- Input normalization, leading-zero ZIP, ZIP+4, invalid states, unsupported geography/Move Type, negative, missing, boolean, number, exponent, precision overflow and unknown field rejection.
- Draft conflict, edit vs publish, publish vs publish, control disable vs publish, transaction abort between each write, unknown commit retry with same operation, changed-body key reuse, rollback and enable versioning. No orphan revision/change or partial pointer update after abort.
- Calculation concurrent publication returns a coherent old or new revision; disabled/unconfigured/corrupt state never yields fabricated price.
- Invalid/expired token, inactive/deleted user, changed role/email/token version, auth authority outage, forged actor/header, Customer Service-only denial, union-role allow, non-Owner configuration denial and mutation replay denial.
- Extension stale response suppression, missing mileage gating, changed inputs, frame/navigation change and display/copy checks are specified in [EXTENSION.md](EXTENSION.md).

Release gates requiring explicit decisions/evidence:

1. Owner supplies and approves real 56-cell matrix, groups, membership, seven rates per group, including intentional zeros. Fresh production control starts disabled/null; setup never imports fixture rates.
2. Owner confirms eligible Move Types/geography and whether one policy intentionally covers all Moving Carriers/seasons. Record the chosen scope before enabling; if narrower than six inputs can establish, extend the request/eligibility contract before release rather than silently assuming eligibility.
3. Owner confirms the recommended numeric bounds/precision, zero-volume behavior, USD and half-up cents, immediate calculation-time pricing, display/copy-only and no stored calculation history.
4. Owner confirms role mapping above; implement/test the existing `/extension/auth/me` adapter and operations Admin signer/proxy without migrating auth or weakening existing guards.
5. Obtain supported-page/frame fixtures proving all six actual inputs, especially mileage. No production auto-enable based on the handoff's assumption of availability.
6. Explicit nonproduction collection/index/transaction verification; deployment to its separate Vercel project; authenticated health and unauthorized denial; no existing main-server writes introduced.
7. Owner reviews matrix discontinuities and representative manual comparisons. Publish approved revision, then separately enable for an authorized pilot; operational disable/rollback must be exercised. Broad Sales access follows pilot acceptance.

This document describes planned behavior; it does not claim the pricing feature is implemented. Production enablement waits for these policy/integration gates; runtime changes require the repository's `pnpm check`.
