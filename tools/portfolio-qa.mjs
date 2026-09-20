// Real Supabase Test / Mux Test fixtures. All credentials remain in this process.
import { testContext, TEST_REF } from "./portfolio-test-context.mjs";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import sharp from "sharp";
const report = { checks: [], screenshots: [] },
  users = [],
  assets = [],
  uploads = [];
const c = await testContext();
const base = "http://127.0.0.1:3106",
  evidence = path.resolve("docs/review/profile-portfolio-editor-v1");
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "filmatta-portfolio-qa-"),
);
let server, browser;
async function mux(url, method = "GET", body) {
  const r = await fetch("https://api.mux.com" + url, {
    method,
    headers: {
      Authorization: c.muxAuthorization,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok && r.status !== 404)
    throw new Error("Mux Test request failed " + r.status);
  return r.status === 204 || r.status === 404 ? null : (await r.json()).data;
}
const check = (condition, label) => {
  assert.ok(condition, label);
  report.checks.push(label);
  console.log("PASS", label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checked = (result) => {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
};
async function fixture(kind, disciplines) {
  const email = `portfolio-${randomUUID()}@example.invalid`,
    password = randomBytes(24).toString("base64url") + "aA1!";
  const result = await c.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Portfolio ${kind} QA` },
  });
  const user = checked(result).user;
  users.push({ id: user.id, email, password, kind });
  const client = c.client(c.anonKey);
  checked(await client.auth.signInWithPassword({ email, password }));
  const presentation = {
    portrait_url: "",
    stage_name: `${kind} · Perfil de prueba`,
    work_area: "Zona Poniente",
    rate_range: "",
    book: [],
    credits: [{ title: "Proyecto de prueba", role: "Dirección", year: "2026" }],
  };
  const slug = checked(
    await client.rpc("save_my_professional_portfolio", {
      p_disciplines: disciplines,
      p_city: "Guadalajara",
      p_bio:
        "Perfil ficticio para validar el editor de portfolio. No es un profesional real.",
      p_availability: "available",
      p_skills: ["Luz natural"],
      p_equipment: ["Cámara digital"],
      p_portfolio_items: [],
      p_presentation: presentation,
      p_is_public: false,
      p_contact_policy: "members_only",
    }),
  );
  checked(await client.rpc("initialize_my_profile_media"));
  return { ...users.at(-1), client, slug, presentation };
}
async function snap(page, name, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await sleep(250);
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `no overflow ${name} ${width}`,
  );
  const output = path.join(evidence, `${name}-${width}.png`);
  await page.screenshot({
    path: output,
    animations: "disabled",
    fullPage: !(await page.getByRole("dialog").count()),
  });
  report.screenshots.push(path.basename(output));
}
async function login(page, user) {
  await page.goto(base + "/login?next=%2Fmi-perfil");
  await page.getByLabel("Correo", { exact: true }).fill(user.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(user.password);
  await page
    .locator("form")
    .filter({ has: page.locator('input[name="password"]') })
    .getByRole("button", { name: /Iniciar sesión/ })
    .click();
  await page.waitForURL("**/mi-perfil", { timeout: 60000 });
  await page
    .getByRole("button", { name: "Editar perfil", exact: true })
    .waitFor();
}
try {
  fs.mkdirSync(evidence, { recursive: true });
  const owner = await fixture("Profesional", [
      "Dirección",
      "Dirección de fotografía",
    ]),
    talent = await fixture("Talento", ["Actuación", "Modelaje"]),
    other = await fixture("Visitante", ["Sonido"]);
  const anon = c.client(c.anonKey);
  const metadata = {
    category: "work",
    title: "Proyecto inicial",
    role: "Dirección",
    year: "2026",
    description: "Prueba de portfolio",
    media_type: "video",
    source: "external",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    featured: false,
  };
  const first = checked(
    await owner.client.rpc("save_my_profile_media", {
      p_id: null,
      p_data: metadata,
    }),
  );
  check(
    Boolean(
      (
        await other.client.rpc("manage_my_profile_media", {
          p_id: first,
          p_action: "archive",
        })
      ).error,
    ),
    "remote non-owner write rejected",
  );
  check(
    Boolean(
      (
        await anon.rpc("save_my_profile_media", {
          p_id: null,
          p_data: metadata,
        })
      ).error,
    ),
    "remote anon write rejected",
  );
  check(
    checked(await anon.rpc("get_profile_media", { p_slug: owner.slug })) ===
      null,
    "remote draft private",
  );
  checked(
    await owner.client.rpc("manage_my_profile_media", {
      p_id: first,
      p_action: "archive",
    }),
  );
  // Existing Preview signing keys remain in Vercel. Local QA never extracts them.
  const webhookSecret = randomBytes(32).toString("hex");
  const cronSecret = randomBytes(32).toString("hex");
  const childEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: c.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: c.serviceKey,
    MUX_TOKEN_ID: c.muxTokenId,
    MUX_TOKEN_SECRET: c.muxTokenSecret,
    MUX_EXPECTED_ENVIRONMENT_ID: c.muxEnv,
    MUX_EXPECTED_ENVIRONMENT_TYPE: "development",
    MUX_WEBHOOK_SECRET: webhookSecret,
    CRON_SECRET: cronSecret,
    PORTFOLIO_DIRECT_UPLOADS_ENABLED: "true",
    BILLING_ENABLED: "false",
    SECURITY_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  };
  delete childEnv.VERCEL;
  delete childEnv.VERCEL_ENV;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3106",
    ],
    { env: childEnv, stdio: ["ignore", "ignore", "ignore"], windowsHide: true },
  );
  for (let i = 0; i < 90; i++) {
    try {
      if (
        (await fetch(base + "/login", { signal: AbortSignal.timeout(2000) })).ok
      )
        break;
    } catch {}
    if (i === 89) throw new Error("QA server did not start");
    await sleep(1000);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await login(page, owner);
  check(true, "real password login through product Auth");
  await page
    .getByRole("button", { name: "Editar perfil", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Añadir tu primer trabajo", exact: true })
    .waitFor();
  for (const width of [1440, 390]) await snap(page, "empty-edit", width);
  await page
    .getByRole("button", { name: "+ Añadir trabajo", exact: true })
    .click();
  for (const width of [1440, 390]) await snap(page, "add-work-selector", width);
  await page.getByRole("button", { name: /^Video/ }).click();
  for (const width of [1440, 390]) await snap(page, "video-embed-form", width);
  await page
    .getByLabel("Enlace de YouTube o Vimeo")
    .fill("https://youtu.be/abcdefghijk");
  await page.getByLabel("Título", { exact: true }).fill("La luz que queda");
  await page.getByLabel("Rol", { exact: true }).fill("Dirección de fotografía");
  await page.getByLabel("Año", { exact: true }).fill("2026");
  await page
    .getByRole("button", { name: "Añadir al portfolio", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    checked(
      await owner.client.rpc("get_profile_media", { p_slug: owner.slug }),
    ).some((i) => i.title === "La luz que queda"),
    "UI embed saves through owner RPC",
  );
  for (let i = 1; i < 5; i++)
    checked(
      await owner.client.rpc("save_my_profile_media", {
        p_id: null,
        p_data: {
          ...metadata,
          title: `Proyecto ${i + 1}`,
          url: i % 2 ? "https://vimeo.com/123456789" : metadata.url,
        },
      }),
    );
  await page.reload();
  await page
    .getByRole("button", { name: "Editar perfil", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Terminar edición", exact: true })
    .waitFor();
  for (const width of [1440, 390]) await snap(page, "portfolio-edit", width);
  const group = page.getByRole("region", { name: "Trabajos", exact: true });
  const before = checked(
    await owner.client.rpc("get_profile_media", { p_slug: owner.slug }),
  ).filter((i) => i.visibility !== "archived");
  await group
    .getByRole("button", { name: "Mover abajo: La luz que queda", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "Orden de" }).waitFor();
  const after = checked(
    await owner.client.rpc("get_profile_media", { p_slug: owner.slug }),
  ).filter((i) => i.visibility !== "archived");
  check(
    after.findIndex((i) => i.title === "La luz que queda") !==
      before.findIndex((i) => i.title === "La luz que queda"),
    "UI reorder persists",
  );
  for (const width of [1440, 390]) await snap(page, "reorder", width);
  await page
    .getByRole("button", { name: "+ Añadir trabajo", exact: true })
    .click();
  await page.getByRole("button", { name: /^Imagen/ }).click();
  const imagePath = path.join(temporary, "qa-image.jpg");
  await sharp("public/images/editorial/monitor.webp").jpeg().toFile(imagePath);
  await page
    .getByLabel("Subir imagen", { exact: true })
    .setInputFiles(imagePath);
  await page.getByLabel("Título", { exact: true }).fill("Still de prueba");
  await page.getByLabel("Rol", { exact: true }).fill("Fotografía");
  for (const width of [1440, 390]) await snap(page, "image-upload", width);
  await page
    .getByRole("button", { name: "Añadir al portfolio", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .waitFor({ state: "hidden", timeout: 60000 })
    .catch(async () => {
      throw new Error(
        await page.getByRole("dialog").getByRole("alert").innerText(),
      );
    });
  const image = checked(
    await owner.client.rpc("get_profile_media", { p_slug: owner.slug }),
  ).find((i) => i.title === "Still de prueba");
  check(
    image?.status === "ready",
    "real Storage image upload decoded and ready",
  );
  const blocked = await (
    await context.request.post(base + "/api/portfolio/uploads", {
      headers: { Origin: base },
      data: {
        item: { ...metadata, source: "mux" },
        file: { name: "too-large.mp4", type: "video/mp4", size: 5_000_000_001 },
      },
    })
  ).json();
  check(
    blocked.error?.includes("YouTube"),
    "server rejects declared >5GB before upload",
  );
  await page
    .getByRole("button", { name: "+ Añadir reel", exact: true })
    .first()
    .click();
  await page.getByLabel("Subir archivo", { exact: true }).check();
  const videoPath = path.join(temporary, "qa-video.mp4");
  const sample = await fetch("https://muxed.s3.amazonaws.com/leds.mp4", {
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(sample.ok);
  fs.writeFileSync(videoPath, Buffer.from(await sample.arrayBuffer()));
  await page
    .getByLabel("Subir video", { exact: true })
    .setInputFiles(videoPath);
  await page.getByLabel("Título", { exact: true }).fill("Reel Mux QA");
  for (const width of [1440, 390]) await snap(page, "video-upload", width);
  const network = await context.newCDPSession(page);
  await network.send("Network.enable");
  await network.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 30,
    downloadThroughput: 10_000_000,
    uploadThroughput: 2_000_000,
  });
  await page
    .getByRole("button", { name: "Añadir al portfolio", exact: true })
    .click();
  await page.getByRole("progressbar").waitFor();
  for (const width of [1440, 390]) await snap(page, "video-progress", width);
  await network.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 90000 });
  for (const width of [1440, 390]) await snap(page, "video-processing", width);
  const mediaRow = checked(
    await owner.client
      .from("profile_media")
      .select("*")
      .eq("title", "Reel Mux QA")
      .single(),
  );
  uploads.push(mediaRow.mux_upload_id);
  let asset;
  for (let i = 0; i < 40; i++) {
    const up = await mux("/video/v1/uploads/" + mediaRow.mux_upload_id);
    if (up.asset_id) {
      asset = await mux("/video/v1/assets/" + up.asset_id);
      if (asset.status === "ready") break;
    }
    await sleep(2000);
  }
  assert.equal(asset?.status, "ready");
  assets.push(asset.id);
  // Local integration delivery: signed fixture backed by the REAL canonical Mux asset.
  // This is not evidence of provider-to-Preview delivery (validated separately).
  const event = JSON.stringify({
      type: "video.asset.ready",
      id: "portfolio-qa-" + randomUUID(),
      environment: { id: c.muxEnv },
      data: { id: asset.id },
    }),
    time = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret)
    .update(`${time}.${event}`)
    .digest("hex");
  const webhook = await fetch(base + "/api/mux/webhooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "mux-signature": `t=${time},v1=${signature}`,
    },
    body: event,
  });
  check(
    webhook.ok,
    "real Test asset verified by signed local webhook delivery",
  );
  const playback = await context.request.get(
    base + `/api/portfolio/media/${mediaRow.id}/resource`,
  );
  check(
    playback.status() === 503,
    "local playback fails closed without signing key; Preview playback remains a separate check",
  );
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(
    base + `/api/portfolio/media/${mediaRow.id}/resource`,
  );
  check(denied.status() === 404, "draft playback denied to anonymous");
  await page.getByRole("button", { name: "Publicación", exact: true }).click();
  await page.getByLabel("Perfil público y compartible").check();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const publicPage = await anonymous.newPage();
  await publicPage.goto(base + "/perfiles/" + owner.slug);
  await publicPage
    .getByRole("heading", {
      name: "Profesional · Perfil de prueba",
      exact: true,
    })
    .waitFor();
  check(
    (await publicPage
      .getByRole("button", { name: "Editar perfil", exact: true })
      .count()) === 0,
    "public profile has no edit controls",
  );
  check(
    (
      await anonymous.request.get(
        base + `/api/portfolio/media/${mediaRow.id}/resource`,
      )
    ).status() === 503,
    "published playback also fails closed without signing key",
  );
  for (const width of [1440, 390])
    await snap(publicPage, "public-portfolio", width);
  await page.getByRole("button", { name: "Publicación", exact: true }).click();
  await page.getByLabel("Perfil público y compartible").uncheck();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    (
      await anonymous.request.get(
        base + `/api/portfolio/media/${mediaRow.id}/resource`,
      )
    ).status() === 404,
    "unpublishing blocks new playback tokens immediately",
  );
  checked(
    await owner.client.rpc("manage_my_profile_media", {
      p_id: mediaRow.id,
      p_action: "archive",
    }),
  );
  // Advance only this fixture's retention deadline to exercise actual cleanup now.
  checked(
    await c.admin
      .from("profile_media")
      .update({ cleanup_after: new Date(Date.now() - 1000).toISOString() })
      .eq("id", mediaRow.id)
      .eq("owner_id", owner.id),
  );
  check(
    (await fetch(base + "/api/portfolio/cleanup")).status === 401,
    "cleanup rejects unauthenticated callers",
  );
  const cleaned = await fetch(base + "/api/portfolio/cleanup", {
    headers: { Authorization: "Bearer " + cronSecret },
  });
  check(
    cleaned.ok,
    "authenticated cleanup removes expired archived Test asset",
  );
  check(
    (await mux("/video/v1/assets/" + asset.id)) === null,
    "cleanup confirms owned Mux asset deleted",
  );
  check(
    checked(
      await owner.client
        .from("profile_media")
        .select("status")
        .eq("id", mediaRow.id)
        .single(),
    ).status === "deleted",
    "cleanup is terminal in profile media",
  );
  const talentContext = await browser.newContext();
  const talentPage = await talentContext.newPage();
  await login(talentPage, talent);
  await talentPage
    .getByRole("button", { name: "Editar perfil", exact: true })
    .click();
  await talentPage
    .getByRole("button", { name: "+ Añadir foto", exact: true })
    .first()
    .click();
  const portraitPath = path.join(temporary, "qa-portrait.jpg");
  await sharp("public/images/editorial/talent-portrait-13306757.webp")
    .jpeg()
    .toFile(portraitPath);
  await talentPage
    .getByLabel("Subir imagen", { exact: true })
    .setInputFiles(portraitPath);
  await talentPage.getByLabel("Título", { exact: true }).fill("Book de prueba");
  await talentPage
    .getByRole("button", { name: "Añadir al portfolio", exact: true })
    .click();
  await talentPage
    .getByRole("dialog")
    .waitFor({ state: "hidden", timeout: 60000 });
  for (const width of [1440, 390]) await snap(talentPage, "talent-book", width);
  check(
    checked(
      await talent.client.rpc("get_profile_media", { p_slug: talent.slug }),
    ).some((i) => i.category === "book" && i.status === "ready"),
    "Talent book shares profile media architecture",
  );
  console.log("QA suite completed");
} catch (error) {
  console.error(
    "QA failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  report.failure = error instanceof Error ? error.message : "Unknown";
  process.exitCode = 1;
} finally {
  await browser?.close();
  // Cleanup tracks only users created by this run and validates provider association.
  for (const u of users) {
    const result = await c.admin
      .from("profile_media")
      .select("*")
      .eq("owner_id", u.id);
    if (result.error) {
      report.cleanupError = true;
      continue;
    }
    for (const row of result.data ?? []) {
      if (row.storage_path) {
        const removed = await c.admin.storage
          .from("profile-media")
          .remove([row.storage_path]);
        if (removed.error) report.cleanupError = true;
      }
      if (row.mux_upload_id) {
        try {
          const up = await mux("/video/v1/uploads/" + row.mux_upload_id);
          if (up?.asset_id) {
            const a = await mux("/video/v1/assets/" + up.asset_id);
            if (a?.passthrough === `filmatta:portfolio:${row.id}`)
              await mux("/video/v1/assets/" + a.id, "DELETE");
          } else if (up?.status === "waiting")
            await mux("/video/v1/uploads/" + up.id + "/cancel", "PUT");
        } catch {
          report.cleanupError = true;
        }
      }
    }
    const removed = await c.admin.auth.admin.deleteUser(u.id);
    if (removed.error) report.cleanupError = true;
  }
  if (server) {
    try {
      execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {}
    await Promise.race([once(server, "exit"), sleep(2000)]);
  }
  fs.rmSync(temporary, { recursive: true, force: true });
  report.cleaned = !report.cleanupError;
  fs.writeFileSync(
    path.join(evidence, "test-qa.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      cleaned: report.cleaned,
    }),
  );
}
