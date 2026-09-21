# Profiles V2: Social + Contact foundation

Branch: `feature/profiles-portfolio-polish`. Test project: `ezlycwkuzkwcnhrhiruv`.
No merge or Production mutation is authorized for this review.

## Data and privacy

Private contact remains canonical in `profile_private_settings`, read/written by
the same `PrivateContactForm`, `loadPrivateContact` and `save_my_private_contact`
from both Mi cuenta and the profile editor. No synchronization or copy exists.

Project preferences remain private by default, including all previously saved
answers. An explicit owner checkbox publishes the existing preferences (including
participation limits). Only the preferences JSON is projected, only while the
profile is public and consent is enabled. Contact fields and Auth metadata never
join that projection. Withdrawing consent or unpublishing removes it immediately.

Follow links `auth.users.id` to `professional_profiles.user_id`. RLS permits only
the authenticated actor's own inserts/deletes/reads. Unique pair and self-follow
constraints apply; targets must be published. The slug RPC derives the actor from
Auth, takes a shared target lock and enforces those same checks. Public reads are
limited to three recent followers with public profiles: slug, name and portrait
only. No follower count, activity feed, visitor tracking or Reel imagery.

## Contact credits

`private.profile_contact_policy.free_contact_limit` starts at 5 and is configurable
by a trusted database operator. `lifetime_v1` is an explicit policy period, with no
automatic reset. Future policies can add periods without deleting relationships.

An insert trigger on the existing private inquiry flow atomically records the
first distinct sender/profile pair. The same per-actor advisory lock protects both
inquiry rate limits and quota across concurrent targets. Free contacts spend one
credit; existing relationships and Pro contacts spend none. Failures roll back the
inquiry and charge together. Pro comes from existing `get_my_billing_plan`, not a
new billing or purchase system. Existing contacts are backfilled without charging
retroactively. A Pro-created relationship remains free after the plan expires.

The existing 10-inquiries/day, 7-day same-profile cooldown, duplicate-message rule
and private inquiry permissions remain unchanged. UI links to an existing active
contact instead of sending another initial inquiry. No new chat system. Pro does
not expose email/telephone/WhatsApp. Authenticated entitlement read failures fail
closed (no fabricated balance). Anonymous visitors are sent through normal login.

## Migration ordering audit

`20260924020000_custom_reel_cover.sql` was committed on 2026-09-20 (92f96a2).
Its prefix is an ordering identifier in the pre-existing 20260923/20260924 series,
not its actual execution date. It depends on the preceding identity/media/reel
projection migrations. Renaming it alone to today's date would place it before
those dependencies. Preserve the established logical sequence and the already
applied Test migration. No ledger repair or Production history rewrite is needed.

`20260924030000_profile_social_contact_foundation.sql` follows that sequence and
adds only this foundation. Apply only this file to Test for this review. The future
date is deliberate continuation of repository order, not a scheduled execution.

## Validation

Local database tests apply real migrations in PGlite with real PostgreSQL roles,
constraints and RLS, including existing billing resolution. Remote integration
`tests/integration/profile-social.test.mjs` is opt-in for the exact Test ref and
uses actual password sessions. It verifies concurrent credit exhaustion, Pro
anti-abuse, consent/draft privacy and Follow permissions, then deletes its users,
profiles, contacts and temporary grant in finally. No secrets are stored in the
test or this report. Review demos are retained deliberately.
