# Database placement recommendation

## Recommendation

Use the existing Atlas cluster and `vantagemovers` database for version one, with new, explicitly owned `moving_pricing_*` collections and a dedicated database credential restricted to the operations service's required resources. The new Express/Vercel deployment is independent regardless of database placement.

The user's original preference was to keep the database. The user reopened this decision on October 25, 2026; this document records a recommendation, not approval to create a database or change Atlas settings. The scaffold preserves the original production database and does not create collections or write data.

## Storage is a cluster resource

Yes: a second logical database in the same Atlas cluster does not get a separate disk allowance. Atlas storage limits and capacity are cluster concerns. MongoDB describes separate databases on one cluster as logical isolation and notes that their collections and indexes consume resources on that cluster. [Atlas database architecture](https://www.mongodb.com/docs/atlas/build-multi-tenant-arch/#each-tenant-in-its-own-database), [Atlas storage FAQ](https://www.mongodb.com/docs/atlas/reference/faq/storage/).

Separating a database can improve organization and database-level permissions. It does not, by itself, isolate CPU, memory, I/O, connections, or storage capacity from another database on the same cluster. A separate cluster would provide a different infrastructure boundary; this project does not currently need one based on the feature described.

Atlas measures limits differently by cluster type, so do not equate BSON document size with billed or consumed disk space. Indexes and retained history matter too. No current cluster size, utilization, or growth measurement is asserted here.

## Options

| Option | Benefit | Cost and consequence |
| --- | --- | --- |
| Existing `vantagemovers`, new collections | Smallest setup; keeps the existing database backup boundary; no cross-database data access needed | Ownership and collection-scoped permissions must remain explicit; resources are shared |
| New logical database on the same cluster | Clear database namespace and convenient database-level access separation | Shares cluster capacity; requires backup and restore coverage for that database, explicit database configuration, and cross-database reads if later needed |
| New cluster | Independent capacity and infrastructure management | Additional operational setup and cost; disproportionate to the current calculator's configuration needs |

This is separation between service domains, not a multi-tenant design. The MongoDB multi-tenant documentation is cited for its explanation of logical databases and resource boundaries, not as a mandate to adopt tenant-per-database or tenant-per-collection patterns.

## Why retain the current database now

The first feature stores a 56-cell rate matrix, seven rates per surcharge group, and revision history. That is a small configuration domain. Optional saved calculation history can grow with usage; the specification must bound what is retained rather than persist every parse or keystroke. This is a qualitative size assessment, not a measured storage forecast.

There is also a concrete existing operational dependency: the main server's [MongoDB backup Service document](../../vantage-main-server/docs/knowledge/services/mongodb-backup.md) states that the daily logical dump is restricted to `vantagemovers` and refuses any other database name. A new database would not automatically be protected by that job. Its coverage must be extended and a restore verified before relying on it. Atlas backup products may have different coverage; no inspection of the account's current backup configuration was performed.

Remaining in the current database keeps the new collections within that job's documented database scope. Verify a backup/restore after pricing collections exist and verify the backup credential can read them; do not infer that a successful deployment proves backup coverage.

## Boundaries that matter whichever option is chosen

- This service owns only its new collections. It does not write Lead, Booking, Cancellation, Extension User, or main-server configuration records.
- The main server remains the identity authority. Do not duplicate user records just to separate services or databases.
- Prefer a distinct Atlas database user with only the new collections' required privileges. Treat provisioning indexes as an explicit operator step, with appropriate permissions, rather than enabling automatic index synchronization against the shared database.
- The connection pool is capped at five per warm function instance, with zero minimum idle connections. Multiple services and instances still add to the cluster's connection load.
- Future analytics must have bounded queries and indexes. A different database name would not protect existing operations from an expensive scan on the same cluster.

If database-level administrative separation becomes the priority, choose a separate logical database on the same cluster before pricing data is seeded. That remains a reasonable organizational alternative once its credentials, explicit configuration, backup inclusion, and restore check are ready. There is no storage-capacity reason to switch for this first feature.
