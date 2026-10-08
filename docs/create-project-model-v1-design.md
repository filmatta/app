# Project Model V1 — design and read-only audit

## Existing model

`public.projects` already exists and is the canonical audiovisual Project. It has `id`, `owner_id`, `title` (the product name), timestamps, a private draft/public lifecycle, and owner RLS. Reuse it. Do not create a competing Project table or repurpose `script_id` as Project identity. The existing networking, opportunity, cover, and publication fields remain intact.

Create artifacts are `writer_scripts`, `writer_shotlists`, `storyboard_panels` (the current Storyboard is the board attached to a Shotlist; there is no standalone Storyboard row), and `production_plans`. Breakdown is owned by a Writer and derives Project through it. Production script/shotlist source references intentionally remain soft so source deletion preserves the plan.

## Target data contract

Add nullable `project_id` to the four artifact tables. Each non-null value has a composite FK `(project_id, owner_id) -> projects(id, owner_id)` with restricted deletion and updates. Add same-project FKs from a Shotlist to its source Writer, and from a Storyboard panel to its Shotlist where the parent link is present. Keep existing source IDs. For Production, validate non-null source references when project/source fields change while preserving current soft-reference semantics after source deletion. New Create resources require Project at the application boundary; historical nulls remain legal until audited.

Use existing Project RLS and existing artifact owner RLS. The current `projects` owner SELECT/INSERT/UPDATE/DELETE policies already exist; no new public artifact read policy is needed. Do not expose Project deletion in the Create UI. A linked artifact's FK prevents deleting its Project. Add only indexes used for owner/project module lists. Project lookup uses its primary key and existing owner indexes.

A central `createProject` operation creates a private draft Project and the initial Writer atomically, returning both IDs. It must use the authenticated owner and preserve Writer quota/idempotency behavior. Shotlist and Production creation must require a selected Project and verify optional sources belong to that same Project. Storyboard panel creation inherits the linked Shotlist Project. A server-side `CreateProjectContext` resolves only metadata and IDs, with route validation against its Project; module bodies load separately. One module opens directly when unique; multiple modules show a list; none show a create state. Direct artifact routes reconstruct Project from database, not React memory.

`projects.title` is the Project name; adding a duplicate `name` column would create conflicting sources of truth. This schema remains compatible with a later `visual_assets.project_id`, account-level entitlements, and a demo clone with new owner/project IDs. `project_created` can be emitted after the atomic creation result in Beta Hardening; no analytics provider is added here.

## Supabase Test audit (read-only, 2026-10-08)

Project ref: `ezlycwkuzkwcnhrhiruv`. Production ref `ihryubbegljbwmuyazbn` was not queried or modified.

| Entity | Rows | Graph result |
| --- | ---: | --- |
| Existing Projects | 5 | All private; owners have no Writer rows. No automatic match to Create artifacts. |
| Writers | 27 | 25 are QA `.invalid` accounts; 2 are other Test data. |
| Shotlists | 18 | 10 have an owned Writer source; 8 have `script_id = null`. |
| Storyboard panels | 8 | All 8 have an owned Shotlist and an explicit Writer path, across 3 Shotlists. |
| Production plans | 3 | 2 have consistent Writer and Shotlist references; 1 has neither. |

The 10 connected Writer→Shotlist groups are unambiguous for backfill. The two linked Production plans join those groups. The 8 panels inherit the matching Shotlist group. No contradictory cross-owner or cross-script references were found. The 8 parentless Shotlists and 1 parentless Production are `LEGACY_UNASSIGNED`; their IDs are in the local read-only audit file. Standalone Writers have no graph edge proving whether two scripts by one owner represent one or several Projects, so they remain legacy unless explicitly selected as QA fixtures. The user-supplied Pulse QA Writer has one linked Shotlist and is in the clear group.

A read-only PostgREST request using the Test service role returned `42501` for `projects`, though it read the four Create tables. The Supabase management SQL query against the explicit Test project returned the 5 Projects. The migration must not depend on a service role client for product behavior. Validate ordinary authenticated Project access after the schema migration.

## Backfill boundary

Run a separate, idempotent Test-only data migration after the schema and application path are ready. Create one private draft Project per eligible Writer root using a deterministic internal slug, then assign the connected Shotlists, panels, and Production plans. Do not assign the 8 parentless Shotlists, the parentless Production, or unrelated existing Projects. Preserve all source references. Report exact assigned/unassigned counts and IDs after running, and retain a reversal mapping. Do not apply to Production.
