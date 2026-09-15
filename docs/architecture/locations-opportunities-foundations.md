# Foundations: Locations + Opportunities

This note defines the smallest shared contract for the first public, read-only
foundations of Locations and Opportunities. It intentionally does not define a
marketplace, an application system, or a complete production-management model.

## Entity boundaries and ownership

- `projects` is the minimal context required by an opportunity. It has an
  owner, public identity (`title` + `slug`), short summary, and lifecycle only.
  It is not yet a project workspace.
- `opportunities` is a structured post owned by the same `auth.users` account
  as its parent project. A composite foreign key enforces that relationship.
  Every opportunity must belong to one project; it is never a generic social
  post.
- `locations` is independently owned inventory with the minimum metadata needed
  for a useful public listing: place type, city/area, interior/exterior, an
  optional indicative price, restrictions, and descriptive copy.
- `location_photos` belongs to the same owner as its location. It stores image
  metadata/URLs only. Upload infrastructure and image processing are deferred.
- Ownership references `auth.users` directly. Linking owners to a future public
  professional profile is explicitly deferred so this migration is independent
  of that schema.

Deleting an auth user cascades through their projects and locations. Deleting a
project cascades through its opportunities; deleting a location cascades through
its photos. Cross-owner child records are rejected by composite foreign keys.

## Lifecycles

- Projects, locations, and photos: `draft` → `published` → `archived`.
- Opportunities: `draft` → `published` → `closed` or `archived`.
- `published_at` is required when a project, location, or opportunity is
  published. It is kept separate from `created_at` so catalog ordering reflects
  publication.
- Database triggers own `created_at`, `updated_at`, and the first
  `published_at`. Later lifecycle transitions preserve that original
  publication time, so client-supplied timestamps cannot manipulate catalog
  ordering.
- Status-transition workflows are deliberately left to future server-side
  mutations; the database currently validates allowed states, not transition
  paths.

## Access and RLS

RLS is enabled on all four tables. Anonymous and authenticated visitors can read
only published rows. A photo is public only when both it and its parent location
are published. An opportunity is public only when both it and its parent project
are published.

Authenticated owners can create and manage only their own rows. Child writes
also verify ownership of the parent. Existing administrators retain full access
through `private.is_admin()`. The public pages still filter explicitly for
published status so an authenticated owner does not see drafts mixed into the
public experience.

Free-text descriptions have generous safety limits at the database layer. This
bounds individual payloads without introducing a content-editor contract.

## Public URLs and slugs

- Locations: `/locaciones/[slug]`
- Opportunities: `/oportunidades/[slug]`

Slugs are globally unique per entity table, lowercase ASCII, and hyphenated
(`^[a-z0-9]+(-[a-z0-9]+)*$`). They are intended as stable public identifiers.
Renaming or redirect history is deferred; future editing UI should treat slug
changes as an explicit action.

## Deferred integrations

- Professional-profile attribution and public owner identity
- Project members, organizations/workspaces, permissions beyond owner/admin
- Posting/editing UI, moderation, reporting, and status-transition actions
- Applications, messaging, matching, saved searches, alerts, and Talent+
- Booking, availability, checkout, deposits, insurance, disputes, and reviews
- Scout filters and detailed production constraints
- Storage buckets, direct uploads, transforms, and external media processing
- Rentals and Services relationships

The migration only prepares the schema; it must be reviewed and applied through
the normal Supabase deployment process before the public pages can return data.
