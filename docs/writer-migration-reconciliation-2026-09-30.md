# Writer migration reconciliation — 2026-09-30

Scope: `codex/staging-full-integration-v1` at initial SHA
`0b7adf8040b6556fc1c10d3ae9e6b637fe386c14`, against Supabase Test
`ezlycwkuzkwcnhrhiruv` only. Production was excluded.

## Historical migrations

### `20260930032000_writer_assisted_import_ordinary_budget.sql`

This migration separates the authorized assisted-import budget from the
theoretical reservation. It replaces the server-only budget resolver and the
11-argument reservation RPC, supports the ordinary 200,000 microusd budget and
the exact active QA grant up to 600,000 microusd, consumes that grant only above
the ordinary budget, and keeps execution restricted to `service_role`.

It adds no table, column, index, trigger, storage object, or RLS policy. It
depends on the assisted-import objects from `20260930030000` and the status
helper from `20260930031000`.

### `20260930033000_writer_assisted_import_staging_budget_policy.sql`

This migration adds the staging human-review budget policy. It expands the
budget constraint to 200,000 / 600,000 / 3,000,000 microusd; adds the
four-argument budget resolver, 12-argument reservation RPC, and six-argument
call reservation RPC; preserves compatible wrappers; raises the configurable
global ceiling from 2,000,000 to 10,000,000 microusd for the staging policy;
and preserves server-only execution.

It adds no table, column, index, trigger, storage object, or RLS policy. Current
Writer server code calls these final overloads, so the migration remains part
of a clean historical rebuild.

## Evidence from Supabase Test before reconciliation

The remote history omitted versions `20260930032000` and `20260930033000`, but
the live schema already matched the final state produced by `300330`:

- the operation budget constraint accepted exactly 200,000 / 600,000 /
  3,000,000 microusd;
- the final four- and three-argument authorization functions existed;
- the final 12- and 11-argument reservation functions existed, plus the legacy
  wrapper;
- the final six- and five-argument call reservation functions existed;
- all affected functions were `SECURITY DEFINER` and executable only by
  `postgres` and `service_role`;
- Writer import tables retained RLS and their expected private grants, indexes,
  and absence of public policies/triggers.

Applying `300320` at that point would have regressed the final overloads.
Reapplying `300330` would only have duplicated already-materialized DDL.
No corrective migration was required because there was no schema delta.

## Decision and action

Both versions were reconciled as applied with the official Supabase migration
history repair workflow, without executing their SQL again:

```text
supabase migration repair --linked --project-ref ezlycwkuzkwcnhrhiruv \
  --status applied 20260930032000 20260930033000 --yes
```

Postflight inspection confirmed unchanged constraint, function definitions,
ACLs and RLS, while `supabase migration list` now reports every local version
through `20260930111000` aligned with Test. The local migration directory has
72 files and zero duplicate versions. A clean environment still executes
`300320` followed by `300330` in order.

## Validation checkpoint

- Writer: 146/146.
- Entitlements/billing: 68/68.
- Profiles: 75/75; current Profiles Search E2E 3/3.
- Catalogs: 30/30.
- Database/RLS: 20/20.
- Security: 18/18.
- Navigation unit tests: 15/15.
- Auth: 35/35.
- Supabase Test full-integration scenario: 1/1.
- Current Writer E2E: 26/26.
- Current Opportunities Search E2E: 2/2.
- TypeScript: pass.
- ESLint: pass with 14 pre-existing warnings and zero errors.
- Production build: pass against the guarded Test configuration.

The repository-wide historical Playwright run was 52/67. The 15 failures are
pre-existing assertions for superseded UI contracts (old `/talento` catalogue,
old opportunity/project publishing form, old account/menu ordering, and old
Tools availability counts). Their current V1 replacement suites pass. These
assertions remain explicit test-suite debt and were not weakened or deleted as
part of this migration reconciliation.
