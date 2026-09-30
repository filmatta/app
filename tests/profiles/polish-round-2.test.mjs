import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("Book has uniform three-column thumbnails and keeps metadata in the lightbox", () => {
  const component = read("components/profiles/PortfolioMedia.tsx");
  const css = read("components/profiles/portfolio-editor.css");
  assert.doesNotMatch(component, /bookShape/);
  assert.match(component, /pm-lightbox-details/);
  assert.match(component, /aria-labelledby="pm-lightbox-title"/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /pm-portfolio:not\(\.pm-portfolio--editing\).*figcaption/);
});

test("reels use a curated cover while preserving the signed player", () => {
  const component = read("components/profiles/PortfolioMedia.tsx");
  const dialog = read("app/mi-perfil/PortfolioDialogs.tsx");
  const migration = read(
    "supabase/migrations/20260924010000_profile_reel_cover_projection.sql",
  );
  assert.doesNotMatch(component, /item\.category === "reel"\s*\? undefined/);
  assert.match(component, /selectedPoster/);
  assert.match(component, /tokens=\{resource\.tokens\}/);
  assert.match(dialog, /Portada del Reel/);
  assert.match(migration, /reel_cover_media_id/);
  assert.match(migration, /cover\.visibility = 'visible'/);
});

test("search catalog receives one bounded visual selected by the public database projection", () => {
  const card = read("components/profiles/ProfileCard.tsx");
  const migration = read(
    "supabase/migrations/20260930010000_profiles_search_v1.sql",
  );
  assert.match(card, /profile\.visual_media_id/);
  assert.doesNotMatch(card, /leadReel|reelSource|portfolio_items|p\.book/);
  assert.match(migration, /1 as priority[\s\S]*cover_media_id/);
  assert.match(migration, /2,[\s\S]*media\.category = 'book'/);
  assert.match(migration, /4,[\s\S]*reel\.category = 'reel'/);
});

test("profile DOM order preserves bio then contact then media on mobile", () => {
  const component = read("components/profiles/ProfilePortfolio.tsx");
  const css = read("components/profiles/profile-public-v2.css");
  assert.ok(
    component.indexOf('<aside className="p2-aside">') <
      component.indexOf('<div className="p2-main">'),
  );
  assert.ok(
    component.indexOf("<ProfileBio text={profile.bio}") <
      component.indexOf('<aside className="p2-aside">'),
  );
  assert.match(css, /position: sticky; top: 24px/);
  assert.match(css, /row-gap: 0/);
});
