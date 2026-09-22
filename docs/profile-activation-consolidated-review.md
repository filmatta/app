# Profile Activation V1 — consolidated review

Scope: `codex/home-profile-activation-v1`, Supabase Test and Vercel Preview only. No merge, Production, email, payments, Search, Matching or networking changes.

## Presentation changes

- The existing nine-step flow and explicit intent triggers remain unchanged. Name → disciplines/draft → optional photo → city → optional bio → availability → optional preferences → optional cover → summary/publication.
- Quick preferences use the existing nine formats and six shooting conditions, in two initially collapsed accordions with counts. Two columns when space permits; one on mobile. Checking means `accept`; clearing means `unspecified`. Advanced themes/participation and `consult`/`decline` remain in the full preferences editor. No new taxonomy or implied refusal.
- An empty cover shows a dashed, actionable placeholder. Existing six local licensed presets and custom upload retain the existing Storage/Auth/RLS pipeline. Cover remains separate from portrait, Book and Reel.
- One header action enters the complete editing mode; `Terminar edición` exits. Publication remains separate. Empty owner media/CV sections remain actionable without entering edit mode.
- Availability is right-aligned at the header/layout boundary on desktop and follows Bio on mobile. It no longer appears inside professional information.
- Professional actions have 14px horizontal padding and 10px gaps. Empty career action says `Construir CV`; an existing career uses `Editar CV`; the public heading is `Trayectoria`.
- Publication uses the existing accessible SelectionRow, with the indicator before the label. Native checkbox/form semantics, draft/public logic and contact policy are unchanged.
- Catalogs share compact editorial cards: 80px desktop / 72px mobile identity image, professional name, primary discipline, availability, city/area, three discipline tags and overflow count, separated footer. Desktop aspect ratio 1.2; 3 columns at 1280/1440, 2 at 1024, 1 on mobile, 4 when enough width exists. Only portrait → initials; never Reel, Book or cover.

## Preferences privacy

The review demo had `publish_project_preferences=false`: its absence in public was correct, not data loss. Keep that owner's decision. The editor now explains private visibility. Only `get_public_project_preferences` supplies the public route. Successful preference saves invalidate the public route and owner editor so prefetched previews cannot remain stale. No service-role product reads or new public fields.

## Database

No new migrations. This round uses the already-applied Test migrations `20260926010000_profile_activation.sql` and `20260926020000_profile_activation_polish.sql`, plus existing media/preference functions. No schema, policies, ledger or Production operations.

## Validation

Automated coverage includes initially collapsed accessible accordions, native publication checkbox semantics, authenticated consent-save invalidation, owner mode/empty sections, and real Test owner/non-owner/anonymous consent projection. Browser QA covers photo Continue persistence, preset/custom covers, removal, publication round trip, preference publication/revocation, CV empty/filled labels, tour target, compact catalogs and mobile order. Temporary fixtures and images are deleted after verification; the pre-existing review account is retained.

Remaining baseline limits: advanced preferences are configured in the full editor; no catalog preference projection is added; image retention/cleanup follows the existing lifecycle. No new auth-provider delivery, payment, Mux or networking end-to-end exercise is introduced by this presentation round.
