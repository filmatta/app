import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";
const p = load("lib/profiles/presentation.ts");
test("Talent is a specialization, including hybrid disciplines", () => {
  assert.equal(p.isTalent(["Actuación", "Dirección"]), true);
  assert.equal(p.isTalent(["Modelaje"]), true);
  assert.equal(p.isTalent(["Fotografía"]), false);
  assert.equal(p.isTalent(["Actor"]), false);
});
test("reels accept known providers, preserve Vimeo privacy hash and never autoplay", () => {
  assert.match(
    p.reelSource("https://youtu.be/abcdefghijk").embed,
    /youtube-nocookie/,
  );
  assert.equal(
    p.reelSource("https://vimeo.com/12345/abcdef").embed,
    "https://player.vimeo.com/video/12345?h=abcdef",
  );
  assert.equal(
    p.reelSource("https://youtube.com.evil.test/watch?v=abcdefghijk"),
    null,
  );
  assert.equal(p.reelSource("javascript:alert(1)"), null);
  assert.equal(
    p.reelSource("https://user:pass@youtube.com/watch?v=abcdefghijk"),
    null,
  );
  assert.doesNotMatch(
    p.reelSource("https://youtube.com/watch?v=abcdefghijk&autoplay=1").embed,
    /autoplay/,
  );
  assert.equal(p.portfolioWebUrl("javascript:alert(1)"), null);
});
test("presentation strips extra keys and rejects unsafe media, oversized or invalid credits", () => {
  const value = {
    ...p.EMPTY_PRESENTATION,
    stage_name: "  Artista  ",
    user_id: "private",
    portrait_url: "https://example.com/photo.jpg",
  };
  assert.equal(p.parsePresentation(value).stage_name, "Artista");
  assert.equal(p.parsePresentation(value).user_id, undefined);
  for (const patch of [
    { portrait_url: "http://example.com/a" },
    { portrait_url: "javascript:x" },
    { credits: [{ title: "Film", role: "Actor", year: "tomorrow" }] },
    { book: Array(7).fill({ url: "https://example.com/a", caption: "" }) },
  ])
    assert.equal(p.parsePresentation({ ...value, ...patch }), null);
});
test("public presentation accepts a separate validated reel cover id", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const parsed = p.parsePresentation({
    ...p.EMPTY_PRESENTATION,
    reel_cover_media_id: id,
  });
  assert.equal(parsed.reel_cover_media_id, id);
  assert.equal(
    p.parsePresentation({
      ...p.EMPTY_PRESENTATION,
      reel_cover_media_id: "not-an-id",
    }),
    null,
  );
});
test("completion has explicit criteria; equipment and optional rate do not penalize talent", () => {
  const profile = {
    disciplines: [],
    city: "",
    availability: "not_specified",
    bio: "",
    portfolio_items: [],
    skills: [],
    presentation: p.EMPTY_PRESENTATION,
  };
  assert.equal(p.profileCompletion(profile).percent, 0);
  const complete = {
    ...profile,
    disciplines: ["Actuación"],
    city: "México",
    availability: "unavailable",
    bio: "Bio",
    skills: ["Inglés"],
    portfolio_items: [
      { kind: "reel", title: "Reel", url: "https://vimeo.com/123" },
    ],
    presentation: {
      ...p.EMPTY_PRESENTATION,
      portrait_url: "https://example.com/p.jpg",
      credits: [{ title: "Film", role: "Actor", year: "" }],
    },
  };
  assert.equal(p.profileCompletion(complete).percent, 100);
  assert.equal(
    p.profileCompletion({
      ...complete,
      portfolio_items: [{ title: "", url: "https://example.com" }],
    }).percent,
    88,
  );
});

test("one chosen public identity, preserving legacy values and safe fallback", () => {
  assert.equal(
    p.professionalName({
      display_name: "Private P.",
      presentation: {
        ...p.EMPTY_PRESENTATION,
        stage_name: "  Sofía Navarro  ",
      },
    }),
    "Sofía Navarro",
  );
  assert.equal(
    p.professionalName({
      display_name: "Sofía N.",
      presentation: p.EMPTY_PRESENTATION,
    }),
    "Sofía N.",
  );
});
