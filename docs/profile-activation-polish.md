# Activation V1 — Final onboarding/profile/catalog polish

Test/Preview only. Extends 8a0a357 without main/Production changes.

- Nine steps: public name, disciplines (ensure valid draft), optional photo, city/area, optional bio, availability, optional conditions/formats, optional cover, summary/explicit publication.
- Generic signup keeps the existing /cuenta or supplied Learn/course destination. Profile CTAs preserve talent/crew intent. /mi-perfil redirects to onboarding only when minimum identity/discipline/city/availability is absent. Exit goes to /cuenta to avoid a redirect loop for incomplete profiles.
- Alias input removed; historical private alias values preserved. The existing stage_name field still holds the single professional name, not a second visible alias.
- Photo uses the existing image editor, purpose=portrait, bucket profile-media, validation, crop, authenticated reservation, completion and owner image assignment. Choose/change, local preview, Continue waits for upload and save; errors stay on the same step. No separate save-image action in onboarding. Local stored reference prevents the previous preview reset.
- Covers use the same lifecycle with purpose=cover and existing cover_media_id. Presets are explicit local assets converted to an image upload only on Continue. No preset-ID column, new bucket, Book insertion, implicit stock, Reel fallback or photo fallback. Owner gets a dedicated add/change cover action outside identity editing; public empty cover stays neutral. Covers do not affect completion weighting in this iteration.
- Quick preferences reuse all nine PROJECT_FORMATS plus the six PREFERENCE_GROUPS.conditions: action/choreography, prop weapons, water/heights, animals, night, travel. There is no existing paid/student/crew preference taxonomy, so none is invented. Checked means accept; unchecked means unspecified. Only touched keys are patched; existing consult/decline values and advanced theme/participation/publication consent are preserved unless explicitly changed. Full preferences editor retains advanced choices.
- Catalog cards share ProfileAvatar, 88px desktop / 72px mobile square identity, bounded metadata and max three tags with overflow count, availability and one profile link. Two desktop columns, one compact mobile column. Only portrait_media_id/portrait_url then initials; no media fallback. No new public preference query, subscription claims, filters or matching.
- Global + simply does not render for anonymous users. Its authenticated actions and Notifications logic are unchanged.

## Test migration

20260926020000_profile_activation_polish.sql adds a nine-step owner RPC and extends/remaps existing private progress. No historical migration edited, no columns removed, no media/schema duplication, no public projections, no RLS/policy changes. Applied only to ezlycwkuzkwcnhrhiruv. Older Preview URLs are superseded for onboarding because checkpoint numbering changed. Reverting the application would require mapping checkpoints back; do not blindly drop/reapply this migration.

## Assets

Six 1440×585 WebP assets in public/images/profile-covers. Sources, authors, retrieval dates and license are in content/image-sources.json. Three are optimized derivatives of existing approved editorial files; three retrieved 2026-09-22. Pexels license checked 2026-09-22: https://www.pexels.com/license/. Images are integrated profile decoration, explicitly labeled Portadas FILMATTA; never presented as the member's work or as endorsement. No hotlinks or standalone image distribution UI.

## Validation and known boundaries

Unit regression plus Test integration cover signup destination, minimum profile intent, checkpoint ordering, private partial identity, required discipline before image upload, quick preference semantics, preservation of existing advanced choices, owner/non-owner/anon, explicit publication and tour persistence. Real Test integration creates three accounts (Learn/no profile, talent, crew) and removes them.

Browser QA and exact final Preview are recorded in the delivery report. Signup confirmation email and Google OAuth delivery are not repeated; no real emails or payments. All normal mutations use Auth + RLS. Existing identity-image storage retention/cleanup policy is reused; this work does not introduce a new deletion policy for historical replaced portraits/covers. No Production migration/deployment/env and no merge.
