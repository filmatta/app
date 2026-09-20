import { test, expect, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const evidence = "docs/review/profile-public-ui-v2/local";
async function session(context: BrowserContext) {
  const b64 = (v: object) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", exp: 4102444800, role: "authenticated" })}.local-signature`;
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" +
        b64({
          access_token: token,
          refresh_token: "local-refresh",
          expires_at: 4102444800,
          token_type: "bearer",
          user: { id: "11111111-1111-4111-8111-111111111111" },
        }),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}
test.beforeEach(async ({ request, page }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=profiles-polish");
  await page.route("https://profiles-fixture.invalid/**", (route) =>
    route.fulfill({
      contentType: "image/webp",
      body: fs.readFileSync(
        path.resolve(
          "public/images/editorial/" +
            (route.request().url().endsWith("portrait")
              ? "talent-portrait-13306757"
              : "monitor") +
            ".webp",
        ),
      ),
    }),
  );
  await page.route("https://i.ytimg.com/**", (route) =>
    route.fulfill({
      contentType: "image/webp",
      body: fs.readFileSync("public/images/editorial/monitor.webp"),
    }),
  );
});
test("six surfaces at six widths: real layout, no overflow, desktop and mobile evidence", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  fs.mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
    await context.clearCookies();
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, name] of [
      ["/descubre/perfiles", "landing-perfiles"],
      ["/descubre/talento", "landing-talento"],
      ["/perfiles", "catalogo-perfiles"],
      ["/talento", "catalogo-talento"],
      ["/perfiles/elena-demo", "perfil-talento"],
      ["/perfiles/mateo-demo", "perfil-profesional"],
      ["/mi-perfil", "mi-perfil"],
    ]) {
      if (route === "/mi-perfil") await session(context);
      await page.goto(route);
      await expect(
        page.locator("main").getByRole("heading", { level: 1 }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.locator("main").evaluate(async (element) => {
        await Promise.all(
          Array.from(element.querySelectorAll("img"))
            .filter((i) => i.loading !== "lazy")
            .map((i) => i.decode().catch(() => {})),
        );
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + " at " + width,
      ).toBe(true);
      if (width === 390 || width === 1440) {
        await page
          .locator("main img")
          .evaluateAll((images) =>
            images.forEach((image) => image.setAttribute("loading", "eager")),
          );
        await page.locator("main").evaluate(async (element) => {
          await Promise.all(
            Array.from(element.querySelectorAll("img")).map((img) =>
              img.decode().catch(() => {}),
            ),
          );
        });
        await page.addStyleTag({
          content: "nextjs-portal { display:none !important; }",
        });
        await page.evaluate(() => {
          const b = document.createElement("div");
          b.id = "review-label";
          b.textContent =
            "REVISIÓN LOCAL · PERFILES FICTICIOS · STOCK EDITORIAL";
          b.style.cssText =
            "position:fixed;bottom:0;left:0;z-index:9999;background:#142027;color:#b9dceb;font:10px Arial;padding:5px 10px;pointer-events:none";
          document.body.append(b);
        });
        await page.screenshot({
          path: `${evidence}/${name}-${width}-viewport.png`,
          animations: "disabled",
        });
        await page.screenshot({
          path: `${evidence}/${name}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  expect(errors).toEqual([]);
});
test("Talent filters share profile URLs and preserve relevant data", async ({
  page,
}) => {
  await page.goto("/talento");
  await expect(page.locator(".profile-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Mateo C/ })).toHaveCount(0);
  await page.getByLabel("Disciplina", { exact: true }).selectOption("Modelaje");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.locator(".profile-card")).toHaveCount(1);
  await page.locator(".profile-card").click();
  await expect(page).toHaveURL(/\/perfiles\/elena-demo/);
  await expect(page.locator(".profile-portrait")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Créditos seleccionados" }),
  ).toBeVisible();
});
test("reel is click-to-load and contact is gated without disclosing private data", async ({
  page,
}) => {
  await page.goto("/perfiles/elena-demo");
  await expect(page.locator("iframe")).toHaveCount(0);

  await expect(
    page.locator('a[href^="/login?next="]').filter({ hasText: "Contactar" }),
  ).toHaveAttribute("href", /next=.*perfiles.*elena-demo/);
  await page.route("https://player.vimeo.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Local video provider fixture</body></html>",
    }),
  );
  await page.getByRole("button", { name: /Cargar reel/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    "https://player.vimeo.com/video/123456789",
  );
  expect(await page.locator("main").innerText()).not.toContain(
    "preview@example.invalid",
  );
  await page.goto("/perfiles/draft-only");
  await expect(page.getByRole("heading", { name: "Elena R." })).toHaveCount(0);
});
test("editor preview stays private; ordering and publication roundtrip; unpublish removes detail", async ({
  page,
  context,
}) => {
  await session(context);
  await page.goto("/mi-perfil");
  await expect(
    page.getByText("Borrador privado", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("Nombre profesional").fill("Elena · Escena");
  await page
    .getByRole("button", { name: "Bajar pieza 1", exact: true })
    .click();
  await expect(page.locator("#title-0")).toHaveValue("La última luz");
  await page.getByRole("button", { name: "Vista previa ↗" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Elena · Escena", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Publicar mi perfil", { exact: false }).check();
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Perfil guardado" }),
  ).toHaveText("Perfil guardado y publicado.");
  await expect(page.locator("#title-0")).toHaveValue("La última luz");
  await page.getByRole("link", { name: "Ver perfil público ↗" }).click();
  await expect(page.getByText("Elena · Escena", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Contactar · próximamente" }),
  ).toBeDisabled();
  await page.goto("/mi-perfil");
  await page.getByLabel("Publicar mi perfil", { exact: false }).uncheck();
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Perfil guardado" }),
  ).toHaveText("Perfil guardado como borrador.");
  await context.clearCookies();
  await page.goto("/perfiles/perfil-propio-demo");
  await expect(page.getByRole("heading", { name: "Elena R." })).toHaveCount(0);
});
test("empty, error, failed image and reduced motion remain usable", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/perfiles?city=Sin+resultados");
  await expect(
    page.getByRole("heading", { name: "No hay perfiles para esta selección." }),
  ).toBeVisible();
  await request.get("http://127.0.0.1:54329/__scenario?value=failure");
  await page.goto("/talento");
  await expect(page.getByText("No pudimos cargar el catálogo.")).toBeVisible();
  await request.get("http://127.0.0.1:54329/__scenario?value=profiles-polish");
  await page.route("https://profiles-fixture.invalid/**", (route) =>
    route.abort(),
  );
  await page.goto("/talento");
  await expect(page.locator(".profile-card").first()).toBeVisible();
  await expect(page.locator(".profile-image-fallback").first()).toBeVisible();
  const duration = await page
    .locator(".profile-card")
    .first()
    .evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(duration).toBe("0s");
});

test("mobile filters collapse without hiding active selections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/talento");
  const toggle = page.getByRole("button", { name: /Filtros/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page.getByLabel("Disciplina", { exact: true }).selectOption("Modelaje");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.getByRole("button", { name: /Filtros/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator(".profile-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Limpiar", exact: true }).click();
  await expect(page.getByRole("button", { name: /Filtros/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("V2: compact bio, one identity, no public score, little content and no reel", async ({
  page,
}) => {
  await page.goto("/perfiles/mateo-demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Mateo Campos",
  );
  await expect(page.locator("main")).not.toContainText("Mateo C.");
  await expect(page.locator("main")).not.toContainText(
    /completitud|Alias artístico/i,
  );
  const bio = page.locator(".p2-bio p");
  expect(await bio.evaluate((e) => e.clientHeight)).toBeLessThanOrEqual(94);
  await page.getByRole("button", { name: "Ver más", exact: true }).click();
  expect(await bio.evaluate((e) => e.clientHeight)).toBeGreaterThan(94);
  await page.getByRole("button", { name: "Ver menos", exact: true }).click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [slug, name] of [
      ["mateo-demo", "mucho-contenido"],
      ["daniel-demo", "poco-contenido"],
      ["sofia-demo", "sin-reel-book"],
    ]) {
      await page.goto("/perfiles/" + slug);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (slug !== "mateo-demo")
        await expect(page.locator(".profile-reel")).toHaveCount(0);
      if (slug === "sofia-demo")
        await expect(page.locator(".p2-gallery")).toBeVisible();
      await page.screenshot({
        path: `${evidence}/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
