import { test, expect, type BrowserContext } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=empty");
});

async function session(context: BrowserContext, role: "user" | "admin") {
  const b64 = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", exp: 4102444800, role: "authenticated", test_role: role })}.local-signature`;
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

test("desktop dropdown works with keyboard, closes on Escape and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name: "Navegación principal",
    exact: true,
  });
  const profiles = nav.getByRole("button", { name: "Perfiles", exact: true });
  await profiles.focus();
  await page.keyboard.press("Enter");
  await expect(profiles).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: /Profesionales/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profiles).toBeFocused();
  await expect(profiles).toHaveAttribute("aria-expanded", "false");
});

test("mobile dialog traps focus, restores it and closes on navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /Menú/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("dialog")?.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Learn", exact: true }).click();
  await expect(page).toHaveURL(/\/descubre\/learn/);
  await expect(dialog).not.toBeVisible();
});

for (const role of ["user", "admin"] as const)
  test(`server session ${role} has direct catalogs and correct account access`, async ({
    page,
    context,
  }) => {
    await session(context, role);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Mi aprendizaje", exact: true }),
    ).toBeVisible();
    const admin = page.getByRole("link", { name: "Administrar FILMATTA" });
    if (role === "admin") await expect(admin).toBeVisible();
    else await expect(admin).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page
        .getByRole("navigation", { name: "Navegación principal", exact: true })
        .getByRole("link", { name: "Learn", exact: true }),
    ).toHaveAttribute("href", "/cursos");
  });

for (const width of [360, 390, 768, 1024, 1280, 1440, 1920])
  test(`landings fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const slug of [
      "perfiles",
      "talento",
      "locaciones",
      "oportunidades",
      "learn",
    ]) {
      await page.goto(`/descubre/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const img of await page.locator("main img").all()) {
        await expect(img).toBeVisible();
        await expect
          .poll(() =>
            img.evaluate((el) => (el as HTMLImageElement).naturalWidth > 0),
          )
          .toBe(true);
      }
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `docs/review/${slug}-${width}.png`,
          fullPage: true,
          style: "nextjs-portal { visibility: hidden; }",
        });
    }
  });

test("direct catalogs stay public, distinguish missing schema and support empty searches", async ({
  page,
  request,
}) => {
  for (const route of [
    "/perfiles",
    "/talento",
    "/locaciones",
    "/oportunidades",
    "/cursos",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await request.get("http://127.0.0.1:54329/__scenario?value=unconfigured");
  await page.goto("/perfiles");
  await expect(
    page.getByText("Este catálogo todavía no está configurado."),
  ).toBeVisible();
  await request.get("http://127.0.0.1:54329/__scenario?value=failure");
  await page.reload();
  await expect(page.getByText("No pudimos cargar el catálogo.")).toBeVisible();
  await request.get("http://127.0.0.1:54329/__scenario?value=published");
  await page.goto("/perfiles");
  await expect(page.getByRole("link", { name: /Persona P\./ })).toBeVisible();
  await page.getByLabel("Ciudad", { exact: true }).fill("Sin resultados");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(
    page.getByText("No hay perfiles para esta selección."),
  ).toBeVisible();
  await expect(page).toHaveURL(/city=Sin\+resultados/);
});

test("published catalog cards open shared details; drafts remain inaccessible", async ({
  page,
  request,
}) => {
  await request.get("http://127.0.0.1:54329/__scenario?value=published");
  for (const [route, title] of [
    ["/perfiles/test-profile", "Persona P."],
    ["/locaciones/test-location", "Espacio de prueba local"],
    ["/oportunidades/test-opportunity", "Convocatoria de prueba local"],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
  }
  await page.goto("/perfiles/draft-only");
  await expect(
    page.getByRole("heading", { level: 1, name: "Persona P." }),
  ).toHaveCount(0);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/perfiles",
      "/talento",
      "/locaciones",
      "/oportunidades",
      "/cursos",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/review/catalog-${route.slice(1)}-${width}.png`,
        fullPage: true,
        style: "nextjs-portal { visibility: hidden; }",
      });
    }
  }
});

test("member can submit a draft through the real server action with local transport", async ({
  page,
  context,
}) => {
  await session(context, "user");
  await page.goto("/mis-oportunidades/nueva");
  await page
    .getByLabel("Título público del proyecto")
    .fill("Producción local de prueba");
  await page.getByLabel("Título", { exact: true }).fill("Convocatoria local");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/review/publish-opportunity-${width}.png`,
      fullPage: true,
      style: "nextjs-portal { visibility: hidden; }",
    });
  }
  await page.getByRole("button", { name: "Guardar oportunidad" }).click();
  await expect(page).toHaveURL(/\/mis-oportunidades\?saved=1/);
});

test("authenticated header stays usable at every requested width", async ({
  page,
  context,
}) => {
  await session(context, "user");
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/perfiles");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Mis publicaciones", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("non-admin cannot open admin and another owner editor is not exposed", async ({
  page,
  context,
}) => {
  await session(context, "user");
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
  await page.goto(
    "/mis-oportunidades/22222222-2222-4222-8222-222222222222/editar",
  );
  await expect(
    page.getByRole("button", { name: "Guardar oportunidad" }),
  ).toHaveCount(0);
});

test("publishing validation preserves the entered draft", async ({
  page,
  context,
}) => {
  await session(context, "user");
  await page.goto("/mis-oportunidades/nueva");
  await page
    .getByLabel("Título público del proyecto")
    .fill("Proyecto que no debe perderse");
  await page
    .getByLabel("Título", { exact: true })
    .fill("Convocatoria conservada");
  await page.getByLabel("Estado", { exact: true }).selectOption("published");
  await page.getByRole("button", { name: "Guardar oportunidad" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Para publicar",
  );
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(
    "Convocatoria conservada",
  );
  await expect(page.getByLabel("Título público del proyecto")).toHaveValue(
    "Proyecto que no debe perderse",
  );
});

test("protected owner and admin routes still reject anonymous visitors", async ({
  page,
}) => {
  for (const route of ["/mi-perfil", "/mis-locaciones", "/admin"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/(login|acceso)/);
  }
});
