import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("Book is an editorial mosaic and keeps metadata in the lightbox", () => {
  const component = read("components/profiles/PortfolioMedia.tsx");
  const css = read("components/profiles/portfolio-editor.css");
  assert.match(component, /pm-piece--\$\{bookShape\(item\)\}/);
  assert.match(component, /pm-lightbox-details/);
  assert.match(component, /aria-labelledby="pm-lightbox-title"/);
  assert.match(css, /grid-template-columns: repeat\(12/);
  assert.match(css, /pm-portfolio:not\(\.pm-portfolio--editing\).*figcaption/);
});

test("reels use a curated cover while preserving the signed player", () => {
  const component = read("components/profiles/PortfolioMedia.tsx");
  const dialog = read("app/mi-perfil/PortfolioDialogs.tsx");
  const migration = read("supabase/migrations/20260924010000_profile_reel_cover_projection.sql");
  assert.match(component, /item\.category === "reel"\s*\? undefined/);
  assert.match(component, /tokens=\{resource\.tokens\}/);
  assert.match(dialog, /Cover del reel/);
  assert.match(migration, /reel_cover_media_id/);
  assert.match(migration, /cover\.visibility = 'visible'/);
});

test("catalog identity order never promotes a reel frame", () => {
  const card = read("components/profiles/ProfileCard.tsx");
  assert.match(card, /p\.portrait_media_id/);
  assert.match(card, /p\.reel_cover_media_id \|\| p\.cover_media_id/);
  assert.doesNotMatch(card, /reelSource/);
  assert.doesNotMatch(card, /p\.book\[0\]/);
});

test("profile layout places contact before content on mobile and aligns desktop grid rows", () => {
  const component = read("components/profiles/ProfilePortfolio.tsx");
  const css = read("components/profiles/profile-public-v2.css");
  assert.ok(component.indexOf('<aside className="p2-aside">') < component.indexOf('<div className="p2-main">'));
  assert.match(css, /\.p2-aside \{ grid-row: 1; \}/);
  assert.match(css, /\.p2-main \{ grid-row: 2; \}/);
  assert.match(css, /\.p2-aside \{ grid-column: 2; grid-row: 2; \}/);
  assert.match(css, /row-gap: 0/);
});
