# ADR 005: Database Row-Level Security

## Status
Proposed

## Context
Data access currently relies on appending `where: { userId }` to Prisma queries across API routes. A single omitted `where` clause causes a data leak. Duplicating security checks across multiple microservices causes out-of-sync access policies.

## Decision
Enforce security at the database tier using Postgres Row-Level Security (RLS). 

Implementation:
1. Enable RLS on Postgres tables and filter rows using a session variable (`app.current_user_id`).
2. Store RLS rules in `@devops/db` and apply them globally via Prisma migrations.
3. Use a Prisma Client Extension to extract the user UUID from the API JWT.
4. Wrap every query in a transaction and execute `set_config('app.current_user_id', <uuid>, true)` before the main query. The `true` flag (`is_local`) is mandatory to wipe the variable on commit and prevent connection pool leakage.

## Consequences
Pros:
- Database acts as an absolute guardrail against missing API filters.
- Fail-safe: A broken or bypassed Prisma extension leaves `current_setting` empty, causing Postgres to return zero rows instead of leaking data.
- Security rules are defined once in SQL instead of scattered across route files.

Cons:
- Wrapping queries in transactions adds performance overhead.
- Improperly scoped `set_config` calls with connection poolers (PgBouncer) leak session state.
- Requires writing raw SQL policies in migration files.


inspired by->https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/

for reference->
https://www.youtube.com/watch?v=OwCgDPa0DnA by milan jovanovic