# Mongo Health

Mongo Health is an Owner-only read view for Admin → Systems. Operations reads the existing configured database (`vantagemovers` in production); it owns no new collections and performs no database writes. It does not invoke or migrate the main server's Systems capacity readers, configuration or daily snapshots.

## API

| GET route | Purpose | Warm-instance cache |
| --- | --- | --- |
| `/api/v1/mongo-health/summary` | Ping; database data/index/document totals; selected-node disk, connections and WiredTiger cache; primary's replica-member view and replication lag | 60 seconds |
| `/api/v1/mongo-health/collections` | Metadata-estimated document counts, logical/allocated/reusable data, index sizes/counts, cumulative read/write averages and operation counts, collection-scan counters | 5 minutes |
| `/api/v1/mongo-health/collections/:name/indexes` | On-demand index definitions, sizes and usage with counter start timestamps | 5 minutes |

Responses use `{ ok: true, data }`; independent probes return `{ status: "available", value }` or `{ status: "unavailable", reason }`. Missing whole dependencies return 503 without raw errors. Unknown collections return 404; collection names must already exist in the bounded inventory. Clients show sample timestamps and preserve visible errors when retaining last-good data. A failed probe is never converted into zero or healthy. No force-refresh query bypasses caches.

## Authentication

Uses the existing dedicated `OPERATIONS_ADMIN_SIGNING_SECRET` (minimum 32 characters), shared only with the Admin server. Every call is signed after Admin validates the current Mongo-backed Owner session. Browser credentials never reach Operations. Assertions use the existing Operations actor header names but a separate `mongo-health` scope; pricing signatures cannot authorize health reads and vice versa. Canonical bytes are newline-joined:

```text
vantage-operations-admin-v1
mongo-health
<24-character actor ID>
owner
<Unix milliseconds>
<UUID request ID>
GET
<exact allowed path, no query>
<SHA-256 of empty body>
```

HMAC-SHA256; constant-time comparison; at most 30 seconds old or 5 seconds ahead. Duplicate actor headers, bearer credentials, request bodies and non-GET methods fail closed. The readiness service secret is insufficient. There are no new environment variables; see [the inventory](environment.md).

## Collection cost and interpretation

One in-flight read per cache key per warm instance. At most 500 inventory entries; two collection workers, 22-second inventory scheduling budget, 4-second per-command execution and 5-second operation timeouts. Index definitions/use are loaded only when expanded, not for every collection on initial page load. Cache entries are bounded. Cold Vercel instances each have their own cache; this is not a distributed sampling or rate-limiting system.

Reads use `ping`, `dbStats`, `serverStatus`, `replSetGetStatus`, `listCollections`, `$collStats`, `listIndexes` and `$indexStats`. No document scans, profiler enablement, index mutation, validation/repair commands or database setup. Statistics across collections are sampled over a time window, not atomically. Summary and collection timestamps can differ.

Filesystem capacity includes other databases, oplog and system files on the sampled node. Reusable storage is inside allocated data files. A full WiredTiger cache alone is not evidence of pressure. Collection averages and index-use counters are cumulative since resets; zero-use indexes are not deletion recommendations. Counts are storage estimates. Replica lag is the primary's observed optime difference and is unknown when primary evidence is missing. Per-node disk/connection/cache metrics are not cluster-wide totals.

Not measured here: p95/p99, recent operations per second, availability/error history, CPU/IOPS, cache eviction/queue diagnostics, oplog window, query-shape examined/returned ratios, expensive sorts, growth trends or backups/Atlas alerts. A Codex MongoDB plugin connection is not application runtime authorization. Those need separately implemented sampling or a server-side Atlas monitoring integration.

## Verification

Offline tests cover Owner signatures, scope/target/role/time tampering, denial before database access, cache coalescing/expiry/retry, metadata-only reads, partial/unavailable probes and refusing unknown index targets. `pnpm check` runs the module tests without production access. Live smoke checks must remain read-only; pricing configuration and enablement are outside this feature.
