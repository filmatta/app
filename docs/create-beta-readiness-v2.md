# FILMATTA Create — beta readiness V2

**Decision: NOT BETA READY — BLOCKERS REMAIN.** The new-account Create journey, Project continuity, PDF export and two-user isolation passed in Vercel Preview against Supabase Test. Public email signup could not be completed in Test because its Auth mail quota returned `over_email_send_rate_limit`. Retest that exact entry path before inviting external users or promoting to staging. This is a validation blocker, not a confirmed application signup defect.

## Git and environments

- Base: `4df605ff8a61654fd0a01101acdad89d131b5d11`; new branch: `codex/create-launch-beta-hardening-v2`. The worktree started clean at that exact commit, and Writer's frozen `ad66922594861b1af12be22f5422ab2a836989aa` is an ancestor. The historical hardening branch was not merged or cherry-picked.
- Candidate SHA: use the final commit on this branch. No changes to `main` or staging; staging remains at the base SHA. No Production database, deployment or domain changes.
- Preview tested: `https://app-pjjkft75v-filmatta.vercel.app` (Preview deployment for `92ae56012b06d5b879504a611a3c4387f6791ef2`, code identical to the final application changes). Final commit receives a separate Preview deployment.
- Backend: Supabase Test project `ezlycwkuzkwcnhrhiruv` only. Disposable QA accounts were deleted after each run.
- Diff: first-run entry and account CTAs, Project/Writer creation recovery, Project module navigation and missing states, Upgrade return path, safe beta telemetry, semantic 404 for denied routes, browser coverage and a Project-aware Storyboard remote fixture. No database migration or payment integration.

## Onboarding and demo

The signed-in empty state explains Create and presents a labelled Project name field. One submission creates a real Project and its initial Writer in the same database transaction, then opens Writer. Existing accounts see their Projects and can add another. The home, account and global navigation paths lead to Create. A double click produced one Project in the clean-account test.

Screenshots from the ignored local test output: `test-results/create-beta-empty-1280.png` and `test-results/create-beta-project-390.png`.

A Demo Project was not included. It would require original, sanitized content and a personal copy across five frozen modules. The first-run flow uses an actual private Project and requires no demo data. Demo remains a scoped follow-up, not an unverified shared fixture.

## Entitlements and upgrade

The existing server resolver in `lib/entitlements/server.ts` remains the single source for configured access and usage; it fails closed when unavailable. Existing route/RLS ownership checks stay server-side. No new Create feature gate or beta quota was activated, and no checkout or tier was added. Consequently, this sprint has no new Create entitlement path that can be bypassed by a direct request; the existing billing/entitlement unit suite passed. A paid-gate bypass test for any future Create capability must accompany that capability.

The existing Upgrade dialog now carries its pathname, query and hash to `/planes`, along with the capability key. The plans page uses the safe return-path parser and offers a link back to the exact work context. The existing `upgrade_gate_viewed` monetization event remains in use. This route was reviewed and unit-covered, but a live paid-gate interaction was not part of the Free clean-account E2E.

## Reliability and continuity

Project, Writer-in-Project, Shotlist and Production creation use stable operation UUIDs across retries. In-flight buttons are disabled, failures show plain-language recovery, and a retry reuses the operation ID until the user changes the input. Writer autosave, Shotlist save and Storyboard save were observed in the Preview journey. The Production Pack downloaded as a PDF. The browser test exercised double click; it did not inject an actual network timeout.

Project pages list each Writer, Shotlist, Storyboard and Production artifact rather than silently choosing among multiple items. They explain missing artifacts and retain the Project in module links. Direct links and reload restored context after logout and login. A second Project showed no Shotlist or Production from the first, and mismatched same-owner module/Project URLs returned 404. Unassigned legacy artifacts were not backfilled or guessed; they remain P2.

Removing two route loading boundaries restored HTTP 404 semantics for an inaccessible Project/Production while preserving the non-disclosing page. No RLS policy was weakened.

## Analytics and observability

Preview logs contain fixed event names plus timestamp and validated technical UUIDs only: `project_created`, `writer_opened`, `shotlist_created`, `storyboard_opened`, `production_created`, and `production_pack_exported`. They contain no screenplay, names, dialogue, prompts, notes, email or token. The existing monetization event covers `upgrade_gate_viewed`. The wrapper records module, operation, error type/code, safe Project UUID and timestamp for important create/export failures; it does not log raw error messages or creative content.

`signup_completed` and `first_writer_edit` were not added: signup confirmation was blocked in Test, and Writer is frozen. Activation can currently be inferred by joining technical user/Project IDs for Project creation, Writer opening and a later planning action. Writer edits are not yet a direct activation event, so the full suggested definition is not directly measurable.

## Security and access

Two ordinary Test users were used. The second user's Project, Writer and Production requests, Production Pack export and Shotlist PDF export returned HTTP 404 with no first-user creative content. RLS returned no foreign Storyboard panels or Production export rows. The Project mismatch tests returned 404. The remote Writer test passed ownership, revisions, operation replay and quota checks; the remote Storyboard test passed ownership, foreign asset rejection, revision conflict and panel isolation. Auth/security unit suites passed. This does not claim a full audit of every private asset URL or future premium action.

## Responsive and accessibility

Project, Writer, Shotlist, Storyboard and Production had no document-level horizontal overflow at **1536, 1280, 1024, 834 and 390 px** in the browser run. A mobile Project screenshot was inspected. The first-run field has a label, its primary button is reachable with Tab, and focus is visible. Main journey controls and dialogs were operable by the test; this is a basic keyboard check, not a WCAG audit.

## Clean-user E2E evidence

One newly created, initially empty Test account logged in through the UI, created Project A and its Writer with a double click, saved three scene headings and a further UI edit, ran local Breakdown, created a Shotlist with two shots, persisted a Storyboard note, created Production from the same Writer, added one day and scheduled a Writer source, then downloaded a Production Pack PDF. It created Project B, confirmed isolation, logged out, logged back in and reopened Project A through a direct link and reload. The registration page and Create return path rendered; email signup submission was blocked by the Test mail quota. Accounts were created with the Test admin API solely to continue the remaining journey.

Latest successful run: 17 checks, four module viewport matrices plus Project, 5/5 foreign HTTP routes returned 404. Ignored machine-readable evidence: `test-results/create-beta-remote.json`.

| Fixture | UUID in Supabase Test (deleted after run) |
| --- | --- |
| Owner | `576d9010-1d23-4d7c-a084-3702bba661e1` |
| Project A | `fd935f8a-6561-41fc-b9ba-ea7fc60aec68` |
| Writer A | `57f34390-2291-4569-889a-8282aa281359` |
| Shotlist A | `b9e841b8-ddf5-4db5-b8d3-551375a22e9c` |
| Production A | `eebed6e3-5ba3-4043-8b54-22f721b9bf9c` |
| Project B | `a83a3818-fb10-4ee9-bb0c-3f693f1f83ef` |
| Writer B | `336a285d-ff24-43d3-b4df-b1603d418168` |
| Second user | `47a257b2-6e3e-4553-8980-4ea9abd1992f` |

## Technical gate

- Unit checks: **601 passed** across Writer (359), Storyboard (11), Create routes (2), Auth (35), Security (18), Billing (68), Navigation (19), Catalogs (30), Database (20), Tools (8) and Mux (31). Full Writer unit suite passed without changing Writer.
- Supabase Test remote checks: Writer **1/1 passed**; Storyboard **1/1 passed** after updating its fixture to create a Project.
- Browser clean-user Preview E2E: **1/1 passed**, with the registration submission limitation above.
- TypeScript `tsc --noEmit`: passed. ESLint: **0 errors, 14 existing warnings**. Next 16.3.8 production build: passed. `git diff --check`: passed.
- First local build attempt could not download Google Fonts under the network sandbox (TEST INFRASTRUCTURE); the permitted network build passed. An older navigation assertion and an older Storyboard remote fixture were updated to the new Project contract (OUTDATED TEST). No flaky failure remains in the final run.

## Issues and decision

| Class | Open item |
| --- | --- |
| P0 | None observed in the tested Create path. Public signup remains unproven, so a real signup defect cannot be ruled out. |
| P1 | Re-enable or reset Supabase Test email delivery, then complete public signup and callback from a fresh address through the final Preview. This is the gate before external beta or staging promotion. |
| P2 | Demo Project deferred; ambiguous legacy artifacts remain unassigned; injected timeout/retry and full asset URL probes were outside this run; first Writer edit is not a direct analytics event. |
| PREEXISTING PRODUCT DEBT | Known Writer `Ver fragmento` caret issue; no Writer product change in this branch. |
| OUTDATED TEST | Navigation CTA assertion and Projectless Storyboard remote fixture updated. Other historically outdated Writer visual/assertion cases were not used to drive product changes. |
| FLAKY TEST | None observed in the final gate. |
| TEST INFRASTRUCTURE | Supabase Test Auth mail quota returned `over_email_send_rate_limit`; sandboxed build could not fetch fonts, while the network-enabled build passed. |

**NOT BETA READY — BLOCKERS REMAIN**
