# Project Model V1 — migration and Test report

## Boundary

Applied only to Supabase Test `ezlycwkuzkwcnhrhiruv` on 2026-10-08. Supabase Production `ihryubbegljbwmuyazbn` was neither queried nor changed. Every data migration was dry-run in a rolled-back transaction before the atomic Test application. No rows were deleted. The historic `20261007010000_production_document_center_v1.sql` was already present in Test migration history and was not reapplied.

## Migrations

| Version | Purpose |
| --- | --- |
| `20261008010000_create_project_model_v1_schema.sql` | Adds nullable `project_id` to `writer_scripts`, `writer_shotlists`, `storyboard_panels`, and `production_plans`; owner-compatible composite Project FKs; specific Writer/Shotlist source FKs; new-resource triggers and atomic Project/Shotlist creation. |
| `20261008020000_create_project_model_v1_backfill.sql` | Creates ten private Projects for unambiguous Writer→Shotlist graphs and assigns their descendants. Idempotent through deterministic slugs and null guards. |
| `20261008030000_create_project_source_guard_v1.sql` | Rejects missing, foreign-owner, or other-Project Production sources on new/changed associations. |
| `20261008040000_create_project_duplicate_fix_v1.sql` | Repairs the Writer duplicate RPC insert column/value mismatch and preserves or creates the canonical Project. |
| `20261008050000_create_project_writer_reentry_v1.sql` | Adds an owner-checked, idempotent Writer creation RPC for a Project whose last Writer was removed. |
| `20261008060000_create_project_identity_v1.sql` | Adds `projects.create_enabled`, marks backfilled and QA Create Projects, and retains their identity after all module rows are removed. |

`projects.title` is the existing canonical Project name; no second name field or competing table was created. `project_id` stays nullable for legacy rows. New Writer creation assigns a Project atomically; Shotlist and Production require one; Storyboard inherits its parent Shotlist's Project. Existing `script_id`, Shotlist links, and Production source IDs remain.

The four artifact-to-Project FKs use `(project_id, owner_id) -> projects(id, owner_id)` and `ON DELETE NO ACTION`. Shotlist→Writer and Storyboard→Shotlist FKs also require matching Project and owner. The existing Storyboard parent deletion behavior is preserved. Project deletion is not exposed in Create. Partial indexes cover owner/Project/updated-at module lists and owner/Create-Project listing. Existing owner RLS on Projects and artifacts was retained; no RLS policy was rewritten or relaxed. The app uses ordinary authenticated clients. Security-definer RPCs check `auth.uid()` and ownership; private trigger helpers are revoked from client roles.

## Read-only graph audit and backfill

Before migration, Test contained 5 unrelated private Projects, 27 Writers, 18 Shotlists, 8 Storyboard panels, and 3 Production plans. Ten Writer roots had clearly linked Shotlists; all 8 panels and 2 Production plans followed those groups. No contradictory ownership or graph edges were found. Seventeen standalone Writers, 8 parentless Shotlists, and 1 parentless Production were left unassigned. The original five Projects were not matched to Create data by owner alone.

The backfill created **10 Projects** and assigned **10 Writers, 10 Shotlists, 8 panels, and 2 Production plans**. It did not guess Project membership for isolated rows. After adding the two same-owner QA Projects and one separate-user QA Project, the final Test counts are:

| Table | Total | Linked to Create Project | Legacy without Project |
| --- | ---: | ---: | ---: |
| `projects` | 18 | 13 | 5 existing non-Create Projects |
| `writer_scripts` | 30 | 13 | 17 |
| `writer_shotlists` | 22 | 14 | 8 |
| `storyboard_panels` | 9 | 9 | 0 |
| `production_plans` | 4 | 3 | 1 |

`LEGACY_UNASSIGNED` is a report classification, not a new persisted status. There are no unresolved contradictory references. The exact unassigned IDs are:

- Writer: `21707e61-87e4-4b51-8e33-5f2438de4aa7`, `2964c334-5d87-4109-a959-9a3303f56c31`, `2a079277-011b-468b-902d-170d484b8e60`, `2b0cf98c-7806-4359-ba38-5700199cf72a`, `4ba57077-afef-4ec1-ba48-c1b6ca6cc6ea`, `4c03553f-b6a4-49e9-8c65-fb1be4c19679`, `6973cff4-134e-4fe5-b368-db002cea6752`, `884b0456-337a-4dea-b2f2-8f1f426d65d7`, `a9d123e1-8155-4e3d-a6bf-05ea2f826ae0`, `b0796ad6-76c1-415f-ad5d-2f3ec8b34003`, `be9809f8-a1a3-45fb-b1e6-5a51f792bd98`, `c8f1e0e1-c96b-4808-b463-7ed07b570831`, `cfc95973-3be8-491d-b576-bff3b0ab39cd`, `dce8e1cc-6bfa-4640-bf19-165a76e0fb02`, `e82b39ce-8a97-49f3-a111-737f152ce527`, `ebe30fe5-9abd-4a14-9449-bf00b2b9fba7`, `fd25c455-4a82-4342-adeb-3fb77a53bbee`.
- Shotlist: `1382399d-4699-4311-814a-b77ad6c9f6f8`, `8c310d93-9634-413d-8ef8-d602e59054b7`, `b0100000-0000-4000-8000-000000000003`, `b0100000-0000-4000-8000-000000000004`, `bdca3e82-6881-48aa-9c22-306b2282dd1c`, `c421906c-4585-4751-86e7-f69a3b8c10eb`, `e37253f2-0f89-4dba-9931-b2a0b0ce9fc3`, `fd0f74a8-109d-4523-9d51-ae614a073eba`.
- Production: `7f94bb79-2c64-466f-b85a-e153a4a102f7`.

A conceptual reversal uses the deterministic `create-writer-v1-<writer-id>` Project slugs to identify the ten backfill groups, removes their assignments, and then removes those empty generated Projects. No reversal was executed. No global `NOT NULL` or destructive cascade was introduced.

## Cross-module QA fixture retained in Test

Ordinary QA user A: Project `bc0fe846-6f94-4940-b6ac-ab51dcb0a2ff` (`Proyecto QA`), Writer `98e04a5e-ea5c-4ba5-8ffc-6ac3438b36cc`, Shotlists `d25d65eb-2bce-4a43-8b0c-da8961504b4f` and `d63089e7-b950-4bb1-a132-695131f32719`, Storyboard panel `dec0261e-fd35-4c17-bb28-8322787d4200`, Production `8f54409f-016d-4376-9282-1f8e7e16e040`, day `babd4c09-d4e9-4519-ae9b-7ca73bf13e7c`. The same user also owns Project B `96861604-f1af-4a87-8804-27e00a89fd34`, Writer `00aa30a9-c5a4-4a33-8d26-46c7db566511`, Shotlist `d67cf587-0883-45ae-b729-4eba4c562ef0`. Ordinary QA user B separately owns Project `97d167f3-5bdb-4286-b4eb-98a103ca3f0b`, Writer `a5bcab27-cebd-47d4-b8f8-06564742d65f`, Shotlist `febfb29e-aaf1-490c-a3ac-9c33e0369b8d`.

The retained QA flow includes three Writer scenes, one local/manual Breakdown tag, three Shotlist shots, Storyboard creation, a Production day and a valid Call Sheet PDF. Navigation lists both Shotlists instead of choosing one. Direct links and reload reconstruct Project context; 1536, 1280, 1024, and 390 px checks passed. Same-owner route tampering across Projects and cross-user reads were denied. Direct forged inserts and mismatched source associations were rejected; private Storyboard assets and Production exports were not readable by another user. No real AI was run.

## Future extension points

A future `visual_assets.project_id` can use the same owner/Project FK pattern. `project_created` can be emitted after the atomic create result in Beta Hardening. Entitlements resolve from the owner/account, with no plan field on Project. A future Demo clone should create a new Project and owner-bound artifact IDs, copying source relationships only within the new Project. None of those features are implemented here.
