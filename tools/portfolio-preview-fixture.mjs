// Dedicated Test fixture for visual signed-playback smoke, not webhook E2E evidence.
import { testContext } from "./portfolio-test-context.mjs";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const c = await testContext(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = path.join(
  os.tmpdir(),
  "filmatta-portfolio-preview-fixture.json",
);
const mux = async (p, method = "GET", data) => {
  const r = await fetch("https://api.mux.com" + p, {
    method,
    headers: {
      Authorization: c.muxAuthorization,
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (r.status === 204 || r.status === 404) return null;
  if (!r.ok) throw new Error("Mux request failed " + r.status);
  return (await r.json()).data;
};
if (process.argv[2] === "cleanup") {
  const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (
    !m.email.startsWith("portfolio-preview-") ||
    !m.email.endsWith("@example.invalid")
  )
    throw new Error("Wrong fixture");
  if (m.asset) {
    const a = await mux("/video/v1/assets/" + m.asset);
    if (a?.passthrough !== `filmatta:portfolio:${m.item}` && a !== null)
      throw new Error("Wrong asset");
    if (a) await mux("/video/v1/assets/" + m.asset, "DELETE");
  }
  const deleted = await c.admin.auth.admin.deleteUser(m.user);
  if (deleted.error) throw new Error("Fixture cleanup failed");
  fs.rmSync(manifest);
  console.log("Preview fixture and Test Mux asset removed");
} else {
  if (fs.existsSync(manifest))
    throw new Error("Clean up the earlier fixture first");
  const email = `portfolio-preview-${randomUUID()}@example.invalid`,
    password = randomBytes(30).toString("base64url") + "aA1!";
  const result = await c.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Portfolio Preview QA" },
  });
  if (result.error) throw new Error("Fixture creation failed");
  const m = { user: result.data.user.id, email };
  fs.writeFileSync(manifest, JSON.stringify(m));
  const user = c.client(c.anonKey);
  if ((await user.auth.signInWithPassword({ email, password })).error)
    throw new Error("Test login failed");
  const presentation = {
    portrait_url: "",
    stage_name: "Portfolio QA · Test",
    work_area: "Zona Poniente",
    rate_range: "",
    book: [],
    credits: [{ title: "Fixture técnico de Mux", role: "QA", year: "2026" }],
  };
  const p = await user.rpc("save_my_professional_portfolio", {
    p_disciplines: ["Dirección"],
    p_city: "Guadalajara",
    p_bio:
      "Perfil ficticio temporal. Material técnico de prueba; no es un profesional real.",
    p_availability: "available",
    p_skills: [],
    p_equipment: [],
    p_portfolio_items: [],
    p_presentation: presentation,
    p_is_public: true,
    p_contact_policy: "closed",
  });
  if (p.error) throw new Error("Profile fixture failed");
  m.slug = p.data;
  fs.writeFileSync(manifest, JSON.stringify(m));
  const sample = await fetch("https://muxed.s3.amazonaws.com/leds.mp4");
  const bytes = Buffer.from(await sample.arrayBuffer());
  const reserved = await user.rpc("reserve_my_profile_upload", {
    p_data: {
      category: "reel",
      title: "Mux Test · Playback firmado",
      role: "QA",
      year: "2026",
      description: "Fixture temporal",
      media_type: "video",
      source: "mux",
    },
    p_size: bytes.length,
    p_mime: "video/mp4",
    p_extension: "mp4",
  });
  if (reserved.error) throw new Error("Reservation failed");
  m.item = reserved.data;
  fs.writeFileSync(manifest, JSON.stringify(m));
  const upload = await mux("/video/v1/uploads", "POST", {
    cors_origin: "https://app-e2pt878l2-filmatta.vercel.app",
    timeout: 3600,
    new_asset_settings: {
      test: true,
      video_quality: "basic",
      playback_policies: ["signed"],
      passthrough: "filmatta:portfolio:" + m.item,
    },
  });
  m.upload = upload.id;
  fs.writeFileSync(manifest, JSON.stringify(m));
  const bound = await user.rpc("bind_my_profile_upload", {
    p_id: m.item,
    p_upload: upload.id,
    p_environment: c.muxEnv,
    p_environment_type: "development",
  });
  if (bound.error) throw new Error("Binding failed");
  const put = await fetch(upload.url, {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": "video/mp4" },
  });
  if (!put.ok) throw new Error("Test upload failed");
  let a;
  for (let i = 0; i < 60; i++) {
    const u = await mux("/video/v1/uploads/" + upload.id);
    if (u.asset_id) {
      m.asset = u.asset_id;
      fs.writeFileSync(manifest, JSON.stringify(m));
      a = await mux("/video/v1/assets/" + u.asset_id);
      if (a.status === "ready") break;
    }
    await sleep(2000);
  }
  if (a?.status !== "ready" || a.passthrough !== "filmatta:portfolio:" + m.item)
    throw new Error("Asset not ready");
  // Fixture setup only: the webhook path is separately tested using real canonical Mux data.
  const ready = await c.admin
    .from("profile_media")
    .update({
      status: "ready",
      mux_asset_id: a.id,
      mux_playback_id: a.playback_ids.find((p) => p.policy === "signed").id,
    })
    .eq("id", m.item)
    .eq("owner_id", m.user);
  if (ready.error) throw new Error("Fixture state failed");
  console.log(
    JSON.stringify({
      profileUrl: `https://app-e2pt878l2-filmatta.vercel.app/perfiles/${m.slug}`,
      item: m.item,
      fixture: true,
    }),
  );
}
