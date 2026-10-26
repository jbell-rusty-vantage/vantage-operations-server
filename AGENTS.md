# Agent guidance

This is a new independent Express/Vercel server for Moving Operations and Analytics. Start with `README.md`, `docs/environment.md`, and `docs/pricing/PLAN.md`. Use the parent workspace `CONTEXT.md` vocabulary when available.

- The user explicitly chose this separate service on October 25, 2026. New transportation pricing behavior belongs here, superseding the earlier proposal to add it to `vantage-main-server`.
- Production remains on the existing `vantagemovers` database and Atlas deployment. Do not create a second production database or move existing functionality here.
- Own new feature collections explicitly; do not mutate existing Lead, Booking, Cancellation, Extension User, or main-server configuration collections. Shared database access does not transfer ownership.
- Keep entrypoints and routes thin. Implement business behavior once in local services. Do not copy pricing rules into the browser extension or import runtime code from sibling repos.
- Never read, print, copy, or commit real credentials. The user will supply them. Environment names are cataloged in `docs/environment.md`.
- Do not weaken auth to get the extension working. Its session/role validation contract must be settled before browser pricing is enabled. A server secret must never be shipped to the extension.
- Run `pnpm check` after runtime changes. Tests must remain offline by default; do not load `.env` or call production dependencies in the test runner.
- Use explicit collection/index setup when a persistence feature is added. Connection bootstrap disables automatic creation and index synchronization across this shared database.
- This service does not inherit the main server's crons, queues, sheet synchronization, or legacy services. Add infrastructure only when required by a new approved feature.
