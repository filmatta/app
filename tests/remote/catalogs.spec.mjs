import { test, expect } from "@playwright/test";
import {
  withTestUsers,
  checked,
  TEST_REF,
} from "../integration/test-project.mjs";
import { previewAccess, previewBase } from "./preview-access.mjs";
test.beforeEach(async ({ context }) => previewAccess(context));
const routes = [
  "/descubre/marketplace",
  "/descubre/jobs",
  "/tools",
  "/tools/writer",
  "/tools/production-assistant",
  "/tools/utilidades",
  "/tools/utilidades/obturacion",
  "/tools/utilidades/almacenamiento",
  "/tools/utilidades/relacion-aspecto",
  "/tools/utilidades/focal-equivalente",
];
test("real Test public pages at seven widths with desktop/mobile evidence", async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} overflow at ${width}`,
      ).toBe(true);
      for (const img of await page.locator("main img").all())
        await expect
          .poll(() => img.evaluate((el) => el.naturalWidth > 0))
          .toBe(true);
      if (route.includes("/utilidades/"))
        await page.getByRole("button", { name: "Calcular" }).click();
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}${route.replaceAll("/", "-")}-${width}.png`,
          fullPage: true,
          style: "nextjs-portal{visibility:hidden}",
        });
    }
  }
});
async function signedContext(browser, user) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    baseURL: previewBase,
  });
  const session = checked(await user.client.auth.getSession()).session;
  const value =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const chunks = [];
  for (let i = 0; i < value.length; i += 3000)
    chunks.push(value.slice(i, i + 3000));
  await context.addCookies(
    chunks.map((value, i) => ({
      name: `sb-${TEST_REF}-auth-token${chunks.length > 1 ? "." + i : ""}`,
      value,
      domain: new URL(previewBase).hostname,
      secure: previewBase.startsWith("https:"),
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    })),
  );
  await previewAccess(context);
  return context;
}
test("real Test browser owner publishing, non-owner rejection and private contact", async ({
  browser,
  page,
}) =>
  withTestUsers(async ({ prefix, owner, stranger, admin, outsider }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const contexts = [];
    try {
      const oc = await signedContext(browser, owner);
      contexts.push(oc);
      const op = await oc.newPage();
      await op.goto("/mis-servicios/nuevo");
      await op
        .locator('main [name="title"]')
        .fill("Sonido directo · prueba aislada");
      await op.locator('main [name="category"]').selectOption("sound");
      await op.locator('main [name="work_mode"]').selectOption("remote");
      await op.locator('main [name="city"]').fill(prefix);
      await op
        .locator('main [name="description"]')
        .fill(
          "Servicio de sonido directo para una producción audiovisual. Registro temporal de validación.",
        );
      await op.getByRole("button", { name: "Guardar servicio" }).click();
      await expect(op).toHaveURL(/mis-servicios\?saved=1/);
      const service = checked(
        await owner.client
          .from("service_listings")
          .select("id,slug")
          .eq("owner_user_id", owner.id)
          .single(),
      );
      await page.goto(`/marketplace/${service.slug}`);
      await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
      await op.goto(`/mis-servicios/${service.id}/editar`);
      await op.locator('main [name="status"]').selectOption("published");
      await op.getByRole("button", { name: "Guardar servicio" }).click();
      await expect(op).toHaveURL(/saved=1/);
      await page.goto(`/marketplace?city=${prefix}`);
      await expect(
        page.getByRole("link", { name: /Sonido directo/ }),
      ).toBeVisible();
      await page.goto(`/marketplace/${service.slug}`);
      await expect(
        page.getByRole("link", { name: "Entrar para contactar" }),
      ).toBeVisible();
      await page.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-service-public-1440.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-service-public-390.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      checked(
        await stranger.client.rpc("save_my_professional_profile", {
          p_disciplines: ["Edición"],
          p_city: prefix,
          p_bio: "Perfil temporal para revisar consultas.",
          p_availability: "available",
          p_skills: [],
          p_equipment: [],
          p_portfolio_items: [],
          p_is_public: true,
          p_contact_policy: "members_only",
        }),
      );
      const sc = await signedContext(browser, stranger);
      contexts.push(sc);
      const sp = await sc.newPage();
      await sp.goto(`/mis-servicios/${service.id}/editar`);
      await expect(sp.getByRole("heading", { name: /404/ })).toBeVisible();
      await sp.goto(`/marketplace/${service.slug}`);
      await sp
        .getByLabel("Tu consulta")
        .fill(
          "Me interesa conocer el alcance del servicio para mi cortometraje.",
        );
      await sp.getByRole("button", { name: "Enviar consulta privada" }).click();
      await expect(sp).toHaveURL(/consultas\?sent=1/);
      await op.goto("/mis-servicios/consultas");
      await op.getByRole("button", { name: "Aceptar interés" }).click();
      await expect(
        op.getByText("Recibida / Interés aceptado", { exact: true }),
      ).toBeVisible();
      await op.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-inbox-owner-1440.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      const uc = await signedContext(browser, outsider);
      contexts.push(uc);
      const up = await uc.newPage();
      await up.goto("/mis-servicios/consultas");
      await expect(
        up.getByText("Me interesa conocer el alcance", { exact: false }),
      ).toHaveCount(0);
      await op.goto("/mis-oportunidades/nueva?type=job");
      for (const [name, value] of Object.entries({
        project_title: "Cortometraje de prueba aislada",
        title: "Edición de cortometraje · prueba aislada",
        discipline: "Edición",
        city: prefix,
        compensation_min: "1500",
        compensation_max: "2000",
        application_deadline: "2099-01-01",
        description:
          "Edición y revisión de un cortometraje de ficción, con dos revisiones incluidas.",
        deliverables: "Montaje final y exportación master con dos revisiones.",
      }))
        await op.locator(`main [name="${name}"]`).fill(value);
      await op.locator('main [name="work_mode"]').selectOption("remote");
      await op
        .locator('main [name="compensation_currency"]')
        .selectOption("MXN");
      await op.locator('main [name="status"]').selectOption("published");
      await op.getByRole("button", { name: "Guardar encargo" }).click();
      await expect(op).toHaveURL(/mis-oportunidades\?saved=1/);
      const job = checked(
        await owner.client
          .from("opportunities")
          .select("id,slug")
          .eq("owner_id", owner.id)
          .eq("opportunity_type", "job")
          .single(),
      );
      await page.goto(`/jobs?city=${prefix}&currency=MXN&budgetMin=1500`);
      await expect(
        page.getByRole("link", { name: /Edición de cortometraje/ }),
      ).toBeVisible();
      await page.goto(`/oportunidades/${job.slug}`);
      await expect(
        page.getByRole("heading", { name: "Entregables", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-job-public-1440.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-job-public-390.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/jobs?q=" + prefix + "-empty");
      await expect(
        page.getByText("No hay encargos para esta selección.", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-jobs-empty-1440.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      await sp.setViewportSize({ width: 390, height: 844 });
      await sp.goto(`/oportunidades/${job.slug}`);
      await sp
        .getByLabel("Tu consulta")
        .fill(
          "Presento mi experiencia de edición y mi interés por este cortometraje.",
        );
      await sp.getByRole("button", { name: "Enviar consulta privada" }).click();
      await expect(sp).toHaveURL(/consultas\?sent=1/);
      await expect(
        sp.getByText("Enviada / Pendiente", { exact: true }),
      ).toBeVisible();
      await sp.screenshot({
        path: `${process.env.FILMATTA_PREVIEW_URL ? "docs/review/remote/df" : "docs/review/df"}-inbox-sender-390.png`,
        fullPage: true,
        style: "nextjs-portal{visibility:hidden}",
      });
      await op.goto(`/mis-oportunidades/${job.id}/editar`);
      await op.locator('main [name="status"]').selectOption("closed");
      await op.getByRole("button", { name: "Guardar encargo" }).click();
      await expect(op).toHaveURL(/saved=1/);
      await page.goto(`/oportunidades/${job.slug}`);
      await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
      await op.goto(`/mis-servicios/${service.id}/editar`);
      await op.locator('main [name="status"]').selectOption("draft");
      await op.getByRole("button", { name: "Guardar servicio" }).click();
      await expect(op).toHaveURL(/saved=1/);
      await page.goto(`/marketplace/${service.slug}`);
      await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
      await op.goto(`/mis-servicios/${service.id}/editar`);
      await op.locator('main [name="status"]').selectOption("published");
      await op.getByRole("button", { name: "Guardar servicio" }).click();
      await expect(op).toHaveURL(/saved=1/);
      await op.goto(`/mis-servicios/${service.id}/editar`);
      await op.locator('main [name="status"]').selectOption("archived");
      await op.getByRole("button", { name: "Guardar servicio" }).click();
      await expect(op).toHaveURL(/saved=1/);
      await page.goto(`/marketplace/${service.slug}`);
      await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
      const ac = await signedContext(browser, admin);
      contexts.push(ac);
      const ap = await ac.newPage();
      await ap.goto("/tools");
      await ap.getByRole("button", { name: "Mi cuenta", exact: true }).click();
      await expect(
        ap.getByRole("link", { name: "Administrar FILMATTA" }),
      ).toBeVisible();
    } finally {
      for (const context of contexts) await context.close();
    }
  }));
