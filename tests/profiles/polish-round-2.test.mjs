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

test("catalog identity order never promotes a reel frame", () => {
  const card = read("components/profiles/ProfileCard.tsx");
  assert.match(card, /p\.portrait_media_id/);
  assert.doesNotMatch(card, /reel_cover_media_id|cover_media_id/);
  assert.doesNotMatch(card, /leadReel|reelSource|portfolio_items|p\.book/);
  assert.doesNotMatch(card, /reelSource/);
  assert.doesNotMatch(card, /p\.book\[0\]/);
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
