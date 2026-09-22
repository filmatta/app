# Home + Profile Activation V1

Branch: `codex/home-profile-activation-v1`, based on `b8d3f83c20d2e1e41518603c2f328b35aef44af6`. Test/Preview only; no merge, Production access, emails, payments or new analytics provider.

## Scope and audit decisions

- Home presents six intentions using existing approved editorial assets. Directional reference: https://themesh.art/; no copied layout/content, invented audience statistics or future-feature claims.
- `/learn` is a redirect to existing `/cursos`; it does not introduce another Learn surface.
- Profile CTAs preserve talent/crew in the existing Auth `next` contract. Existing course, project and account flows are unchanged. Only registration copy adapts to profile intent.
- A configured existing user is never automatically redirected. The guided route is explicit. Home offers creation if no profile, completion if minimum fields are missing or completion is below 75%, otherwise the public profile (or owner editor for a draft).
- Minimum for finishing this onboarding: public name, 1–5 disciplines, city, explicit existing availability. Existing publication rules are unchanged. Bio, photo and preferences remain optional.
- Existing `presentation.stage_name` represents the single chosen professional name. The optional alternate alias stays in private onboarding identity; no second public name is introduced.
- User approved photo after discipline selection in step 2. The existing database requires a discipline before a profile can exist. Step 1 therefore persists privately; step 2 creates a private profile through the existing save RPC and enables the existing identity-image uploader. No invented discipline or relaxed profile constraint.

## Six steps and persistence

1. Public name and optional private alternate alias.
2. Existing discipline taxonomy, multiple selection, talent/crew reordered without hiding options. After confirmation: optional photo via existing upload/storage/validation/ownership lifecycle.
3. City and existing approximate work area.
4. Optional bio, retaining existing contact-content validation.
5. Existing availability choices.
6. Optional existing night/travel conditions; all other preferences and existing publication consent are retained.

Every confirmed step is persisted atomically by `save_my_profile_onboarding`. Progress is a monotonically increasing checkpoint. Back reuses current local values; reload resumes confirmed server state. Omission sends an empty patch and does not erase an existing bio or preferences. No full client profile snapshot is written: each RPC patches only that step's columns under owner-scoped locks. Existing unrelated profile fields, media, CV, equipment, privacy and public state are preserved. Final summary stays private until the separate explicit Publicar perfil action.

## Private Test migration

`supabase/migrations/20260926010000_profile_activation.sql` adds private started/completed/tour timestamps, a 1–7 checkpoint and small private identity draft to `profile_private_settings`. New authenticated RPCs: `save_my_profile_onboarding(integer,jsonb)` and `finish_my_profile_tour()`.

All ownership is derived from `auth.uid()`; no client owner parameter. Empty search paths and explicit execute grants. Existing RLS/policies, public projections and profile publication constraints are untouched. No profile schema split or auth metadata used as onboarding storage. Applied only to `ezlycwkuzkwcnhrhiruv`. Production migration tracking/baseline remains a prerequisite for a future release; not addressed here. Rollback after reverting application: drop these two new functions and five new columns (onboarding progress would be lost), without reverting any older migration or profile data.

## Completion and owner experience

`activationCompletion` is the central Home/editor helper, calculated from meaningful sections of actual profile/media/private-preference state. Eight sections for talent/visual roles: identity+city, photo, bio, availability, preferences, Reel/video, Book, CV. Other crew/production roles use seven sections with skills/equipment instead of mandatory Reel/Book. Photography can satisfy visual work with Book. Equal section weights, rounded percentage 0–100. Pending/errored/archived media and identity/reel-cover assets do not count as portfolio. Legacy JSON is used only before media initialization. The legacy `profileCompletion` export remains only for its historical contract/tests.

Owner-only progress and actionable empty Reel, Videos, Book (4:5) and CV states. Public profile hides empty sections and their navigation entries. Identity reuses the existing avatar/initial fallback. Mux playback, Book lightbox, media selection, profile/contact privacy and social data remain independent.

## Tour and events

Four native-dialog coach marks: preview identity, edit, media, public view/publication. Keyboard focus, Escape, Back/Next/Skip, bounded mobile sheet, subtle target highlight. Completing/skipping persists per user in Test; explicit replay remains available. A failed persistence request reports the issue without trapping the user in the tour.

No existing product analytics provider found. `activationEvent` dispatches only a local `filmatta:activation` CustomEvent with a fixed event name and optional safe intent/step category. No transport, IDs, bio, email, phone, WhatsApp, preference values or new provider. Hooks: home_intent_clicked, profile_onboarding_started, profile_onboarding_step_completed, profile_onboarding_skipped, profile_onboarding_completed, profile_published_from_onboarding, profile_tour_started/completed/skipped, profile_completion_cta_clicked. Connecting a provider is future work; hooks do not constitute collected analytics.

## Validation

- Unit suite: 282 passing, including six new activation tests.
- Real Test Auth/RLS integration: `tests/integration/profile-activation.test.mjs`. Creates two disposable users, verifies step persistence, required fields, optional omission, ownership, anonymous/private projection, explicit publication, anti-spoofing, idempotent tour completion; deletes both users and verifies zero related rows. Privileged key is memory-only for fixture Auth administration; all product flows use signed-in JWTs and RLS. Cleanup verification uses a read-only SQL count scoped to those exact fixture UUIDs because service_role intentionally lacks profile SELECT.
- Actual Preview browser QA: Home, intent through registration/login, step-by-step onboarding, portrait upload, refresh/resume, skip bio/preferences, draft summary, explicit publication, editor placeholders, tour finish/reload/replay/skip, mobile layout.
- Dedicated retained Test review demo: `activation-review-20260921@example.invalid`, owner `3e377a30-f4e9-4a06-a319-6028a6a15ec4`, public slug `activaci-n-d`. Uses an existing editorial stock portrait, clearly named Demo ficticia. This demo and its portrait are deliberately retained for requested review. No disposable integration users retained.
- Browser automation without an existing Vercel login reaches the protection login; QA uses the authenticated in-app browser. No protection bypass or env modification.
- New account registration form/next inspected; no confirmation email sent. Existing Auth unit regression covers unchanged signup handling. No live Google OAuth or email-confirmation delivery claim.

Final deployment URL, final validation and visual checklist are recorded in the delivery report after deployment of the committed candidate. Await visual review; no merge.
