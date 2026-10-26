# Transportation pricing initial plan

## Hosting decision

On October 25, 2026, the user selected a new independent Vercel-deployed Express server for Moving Operations and Analytics because the main server is already too large. This service, `vantage-operations-server`, owns the new transportation calculator. This decision supersedes the main-server placement proposed in the initial document review.

Nothing moves out of the existing server. Production uses the same Atlas deployment and `vantagemovers` database. The user supplies MongoDB and other credentials. A shared database does not make existing collections shared write surfaces.

## First feature

Implement the Owner's deterministic transportation rate policy for the browser extension, then research a broader prediction system separately. Source: `C:\Users\Pinda\Downloads\Agent_Pricing_Engine_Developer_Handoff.docx`, sections 1 through 12. The handoff supplies requirements to analyze; it does not authorize seeding its example rates as production values.

- Inputs: actual cubic feet, unrounded mileage, pickup and delivery states, and ZIPs.
- Billable volume is `max(actualCf, 300)`.
- Select one of eight mileage bands and seven volume tiers with the exact continuous boundaries in the handoff.
- Select the base rate from the 56-cell matrix.
- Select the pickup state's active surcharge group first; only otherwise consider delivery. Never stack. A configured zero pickup surcharge still takes precedence.
- Missing base rate returns `MILEAGE_RATE_NOT_CONFIGURED`. Missing selected surcharge-tier rate returns `STATE_SURCHARGE_NOT_CONFIGURED`; do not fall through to delivery.
- Multiply billable CF by the combined rate using decimal-safe arithmetic. Preserve actual and billable volume separately.
- Output is transportation price only. Ancillary fees, Binding Estimate Fee, discounts, inventory calculation, mapping, deposits, and quote/contract generation remain excluded.

The calculator is not yet implemented. This repository currently supplies its server foundation only.

## Decisions before feature implementation

1. Owner supplies real base rates, group memberships, and all seven surcharge rates per group. Do not copy the illustrative amounts into production.
2. Confirm eligible Move Types, geography, and whether a common rate policy intentionally applies across Moving Carriers and seasons.
3. Confirm intentional zero volume behavior, maximum supported inputs, decimal precision, USD currency, and final rounding. Proposed rounding is half-up to cents after multiplication.
4. Confirm pricing at calculation time versus pricing for the move date; immediate revision activation keeps the first version small.
5. Verify the parser against representative supported pages/frames. The supplied saved Granot form establishes all six inputs, including the displayed Distance in Miles; other layouts and upstream mileage precision still need a controlled pilot. See [EXTENSION.md](EXTENSION.md).
6. Confirm Owner/Sales calculation access, configuration authority, Customer Service access, and the authenticated call path from the Admin Dashboard and extension.
7. Agree on result retention and whether first release is display/copy only. No automatic Granot field write is proposed.

## Authentication across the service boundary

Existing Extension User login/session issuance and user management remain in the existing server. Do not create duplicate users, mint a parallel user identity, or move auth routes here. The new service must eventually verify current user/session validity and roles, including revocation, before a pricing route is enabled.

The selected contract in [SPECIFICATION.md](SPECIFICATION.md) forwards the access token server-to-server to the existing main-server `GET /api/v1/extension/auth/me` on each calculation, preserving current session validation without adding a main-server route or copying token keys. Admin configuration uses a new operations-specific signed server call after current Owner session validation in the Admin proxy. Do not simply accept any JWT with a matching signature, treat an incoming role header as trusted, or give browser clients the server secret.

The scaffold's protected readiness route is for server-to-server diagnostics only. It does not implement Sales or Admin actor authorization. The proposed auth integrations keep `vantage-main-server` unchanged.

## Implementation sequence

1. **Foundation - implemented and deployed:** standalone Express export, local runner, Vercel config, lazy small-pool Mongo connection, health/readiness, secret handling, offline tests, environment docs. The Vantage team production project is live at https://vantage-operations-server.vercel.app; user credentials remain pending.
2. **Contract:** settle the decisions above; capture representative Granot fixtures and expected calculation examples. Select the auth integration without moving existing features.
3. **Calculation and persistence:** pure calculation function, authenticated route, explicit `moving_pricing_*` collection definitions and indexes, and immutable configuration revisions. Use the existing database. No imports from the old server's runtime.
4. **Configuration:** Owner controls in the existing Admin Dashboard call the new API through an authenticated server boundary. Validate complete revisions before publishing all values atomically. Show surprising total-price changes across tier boundaries. Retain prior revisions for rollback.
5. **Extension:** a new authorized workspace reads the move, calls this service, and displays the breakdown and revision. Keep DOM selectors in parsers, and clear current-price status whenever inputs change or calculation fails.
6. **Pilot:** Owner compares representative results with manual answers before broader Sales access. Disabling this feature or restoring prior rate values must not affect existing services.

## Acceptance

Test minimum volume, decimal boundary values, all mileage and volume edges, zero versus missing rates, pickup precedence, inactive groups, invalid input, exact rounding, concurrent publication, and session/role denial. Use the Owner's examples as fixtures only. Verify that supported Granot pages provide the inputs and that one result uses one configuration revision.

Evaluate the actual production matrix for discontinuities: applying a lower per-CF rate to the whole load can make a larger move cheaper. Preserve the Owner's rule unless the Owner chooses a different policy. Correct rule execution and commercial pricing suitability are separate acceptance questions.

## Later research

Define the prediction target first: transportation price, full quote, carrier cost, final charged amount, or margin recommendation. Audit available historical data before choosing a model. Candidate variables include season, Moving Carrier, directional pickup/delivery geography, inventory, service level, and access constraints.

Separate initial estimated inputs from facts learned after the move. Account for Bookings being a selected subset of quoted moves and final prices reflecting changes and extras. Compare improvements with the versioned calculator using time-ordered validation, dollar error, and systematic underpricing by segment. Start with shadow evaluation and an explicit fallback. This research does not expand the first calculator's scope.
