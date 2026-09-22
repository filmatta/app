import { test, expect } from "@playwright/test";
import { withTestUsers, checked } from "../integration/test-project.mjs";
import {
  previewAccess,
  previewBase,
  signedPreviewContext,
} from "./preview-access.mjs";
const landings = [
  "/",
  "/descubre/perfiles",
  "/descubre/talento",
  "/descubre/locaciones",
  "/descubre/oportunidades",
  "/descubre/learn",
  "/descubre/marketplace",
  "/descubre/jobs",
  "/tools",
  "/tools/writer",
  "/tools/production-assistant",
];
const catalogs = [
  "/perfiles",
  "/talento",
  "/locaciones",
  "/oportunidades",
  "/marketplace",
  "/jobs",
];
async function settled(page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const img of await page.locator("main img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }
  await page.evaluate(() => scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByText(
      /Application error|módulo aún no está configurado|No pudimos cargar/i,
    ),
  ).toHaveCount(0);
}
async function shot(page, name, width) {
  await page.screenshot({
    path: `docs/review/remote/${name}-${width}.png`,
    fullPage: true,
  });
}
test.beforeEach(async ({ context }) => previewAccess(context));
test("remote populated ecosystem, public/draft details, filters, owner forms and authorization", async ({
  browser,
  page,
}) =>
  withTestUsers(async ({ prefix, anon, owner, stranger, admin, outsider }) => {
    const city = "QA " + prefix.slice(-8);
    const profiles = [];
    const locations = [];
    const opportunities = [];
    const services = [];
    const contexts = [];
    for (const [u, discipline, pub] of [
      [owner, "Dirección de fotografía", true],
      [stranger, "Actuación", true],
      [admin, "Edición", true],
      [outsider, "Modelaje", false],
    ]) {
      const slug = checked(
        await u.client.rpc("save_my_professional_profile", {
          p_disciplines: [discipline],
          p_city: city,
          p_bio:
            "QA temporal. Identidad sintética para revisar el portfolio audiovisual; no representa a una persona real.",
          p_availability: "available",
          p_skills: ["Producción audiovisual"],
          p_equipment: [],
          p_portfolio_items: [],
          p_is_public: pub,
          p_contact_policy: "members_only",
        }),
      );
      profiles.push({ slug, pub });
    }
    for (let i = 0; i < 3; i++) {
      const row = checked(
        await owner.client
          .from("locations")
          .insert({
            owner_id: owner.id,
            title: [
              "QA · Estudio de luz natural",
              "QA · Espacio industrial",
              "QA · Locación privada",
            ][i],
            slug: `${prefix}-location-${i}`,
            city,
            space_type: i === 1 ? "Industrial" : "Estudio",
            environment: "interior",
            summary:
              "Fixture temporal de QA. Fotografía editorial, no inventario real.",
            description:
              "Espacio sintético para verificar información, fotografías, condiciones y permisos de publicación.",
            status: i < 2 ? "published" : "draft",
          })
          .select("id,slug,title,status")
          .single(),
      );
      locations.push(row);
      checked(
        await owner.client.from("location_photos").insert({
          location_id: row.id,
          owner_id: owner.id,
          image_url: previewBase + "/images/editorial/space.webp",
          alt_text:
            "Referencia editorial para QA, no fotografía del espacio anunciado",
          status: "published",
          sort_order: 0,
        }),
      );
    }
    for (let i = 0; i < 7; i++) {
      const job = i >= 3;
      const title = [
        "QA · Casting cortometraje",
        "QA · Crew iluminación",
        "QA · Colaboración estudiantil",
        "QA · Edición de documental",
        "QA · Fotografía de producto",
        "QA · Job privado",
        "QA · Oportunidad privada",
      ][i];
      const id = checked(
        await owner.client.rpc("save_my_opportunity", {
          p_id: null,
          p_project_title: "QA · Producción temporal",
          p_status: i < 5 ? "published" : "draft",
          p_data: {
            title,
            description:
              "Fixture temporal de QA para revisar un brief audiovisual con condiciones y requisitos claros.",
            category: job
              ? "paid_work"
              : ["casting", "crew", "collaboration"][i],
            discipline: job ? "Edición" : "Actuación",
            city,
            work_mode: i === 4 ? "on_site" : "remote",
            compensation_type: job ? "paid" : "unpaid",
            compensation_min: job ? 1500 : null,
            compensation_max: job ? 2500 : null,
            compensation_currency: job ? "MXN" : null,
            opportunity_type: job && i !== 6 ? "job" : "opportunity",
            deliverables: job
              ? "Montaje final y exportación máster; dos revisiones incluidas."
              : "",
            application_deadline: "2099-01-01",
            starts_on: "2099-02-01",
            ends_on: "2099-02-28",
          },
        }),
      );
      opportunities.push(
        checked(
          await owner.client
            .from("opportunities")
            .select("id,slug,title,status,opportunity_type")
            .eq("id", id)
            .single(),
        ),
      );
    }
    for (let i = 0; i < 4; i++) {
      const id = checked(
        await owner.client.rpc("save_my_service", {
          p_id: null,
          p_status: i < 3 ? "published" : "draft",
          p_data: {
            title: [
              "QA · Sonido directo",
              "QA · Color y acabado",
              "QA · Equipo de cámara",
              "QA · Servicio privado",
            ][i],
            category: ["sound", "postproduction", "equipment", "sound"][i],
            description:
              "Directorio de contacto: servicio audiovisual sintético y temporal para validación de QA.",
            city,
            work_mode: "remote",
            indicative_price: 1500,
            currency: "MXN",
            portfolio_links: [],
          },
        }),
      );
      services.push(
        checked(
          await owner.client
            .from("service_listings")
            .select("id,slug,title,status")
            .eq("id", id)
            .single(),
        ),
      );
    }
    try {
      for (const width of [1440, 360, 390, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of [...landings, ...catalogs]) {
          await page.goto(
            route +
              (catalogs.includes(route)
                ? "?city=" + encodeURIComponent(city)
                : ""),
          );
          await settled(page);
          if (width === 1440 || width === 390)
            await shot(
              page,
              route === "/" ? "home" : route.slice(1).replaceAll("/", "-"),
              width,
            );
        }
      }
      for (const [route, pub] of [
        ...profiles.map((x) => ["/perfiles/" + x.slug, x.pub]),
        ...locations.map((x) => [
          "/locaciones/" + x.slug,
          x.status === "published",
        ]),
        ...opportunities.map((x) => [
          "/oportunidades/" + x.slug,
          x.status === "published",
        ]),
        ...services.map((x) => [
          "/marketplace/" + x.slug,
          x.status === "published",
        ]),
      ]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: /404/ })).toHaveCount(
          pub ? 0 : 1,
        );
        if (pub) {
          await settled(page);
          await expect(page.locator("main:visible")).not.toContainText(
            "PrivateSurname",
          );
          await expect(page.locator("main:visible")).not.toContainText(
            "@example.invalid",
          );
        }
      }
      for (const route of catalogs) {
        await page.goto(`${route}?city=${encodeURIComponent(city)}&page=2`);
        await expect(
          page.getByRole("link", { name: /Anterior/ }),
        ).toBeVisible();
      }
      await page.goto("/jobs?city=" + encodeURIComponent(city));
      for (const row of opportunities)
        await expect(
          page.getByRole("link", { name: new RegExp(row.title) }),
        ).toHaveCount(
          row.status === "published" && row.opportunity_type === "job" ? 1 : 0,
        );
      await page.goto(`/jobs?city=${encodeURIComponent(city)}&currency=USD`);
      await expect(
        page.getByText("No hay encargos para esta selección.", { exact: true }),
      ).toBeVisible();
      await page.goto(
        `/marketplace?city=${encodeURIComponent(city)}&category=sound`,
      );
      await expect(
        page.getByRole("link", { name: /QA · Sonido directo/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /QA · Color y acabado/ }),
      ).toHaveCount(0);
      await page.goto(
        `/oportunidades?city=${encodeURIComponent(city)}&category=casting`,
      );
      await expect(
        page.getByRole("link", { name: /QA · Casting/ }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /QA · Crew/ })).toHaveCount(
        0,
      );
      await page.goto(`/talento?city=${encodeURIComponent(city)}`);
      await expect(page.locator("main:visible")).toContainText("Actuación");
      await expect(page.locator("main:visible")).not.toContainText(
        "Dirección de fotografía",
      );
      const oc = await signedPreviewContext(browser, owner);
      contexts.push(oc);
      const op = await oc.newPage();
      await op.goto("/mi-perfil");
      await op
        .locator('[name="bio"]')
        .fill(
          "QA temporal editado en Preview remoto. Perfil sintético, sin información personal real.",
        );
      await op
        .getByRole("button", { name: "Guardar perfil", exact: true })
        .click();
      await expect(op).toHaveURL(/saved=/);
      await op.setViewportSize({ width: 390, height: 1000 });
      await op.goto(`/mis-locaciones/${locations[0].id}/editar`);
      await op
        .locator('[name="summary"]')
        .fill("QA temporal editado desde Preview remoto.");
      await op
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .click();
      await expect(op).toHaveURL(/success=saved/);
      await settled(op);
      await shot(op, "owner-location-form", 390);
      for (const table of ["locations", "location_photos"]) {
        const id =
          table === "locations"
            ? locations[0].id
            : checked(
                await owner.client
                  .from(table)
                  .select("id")
                  .eq("location_id", locations[0].id)
                  .single(),
              ).id;
        const changed = await stranger.client
          .from(table)
          .update(
            table === "locations"
              ? { title: "FORBIDDEN" }
              : { alt_text: "FORBIDDEN" },
          )
          .eq("id", id)
          .select("id");
        expect(changed.error || changed.data?.length === 0).toBeTruthy();
        const anonymous = await anon.from(table).insert(
          table === "locations"
            ? {
                owner_id: owner.id,
                title: "FORBIDDEN",
                slug: prefix + "forbidden",
                city,
                space_type: "Estudio",
                environment: "interior",
              }
            : {
                owner_id: owner.id,
                location_id: locations[0].id,
                image_url: previewBase + "/images/editorial/space.webp",
              },
        );
        expect(anonymous.error).toBeTruthy();
      }
      const sc = await signedPreviewContext(browser, stranger);
      contexts.push(sc);
      const sp = await sc.newPage();
      await sp.goto(`/mis-locaciones/${locations[0].id}/editar`);
      await expect(sp.locator('[name="summary"]')).toHaveCount(0);
      await sp.goto("/admin");
      expect(new URL(sp.url()).pathname).not.toBe("/admin");
      const ac = await signedPreviewContext(browser, admin);
      contexts.push(ac);
      const ap = await ac.newPage();
      await ap.goto("/admin");
      await expect(ap.getByRole("heading", { level: 1 })).toBeVisible();
      expect(new URL(ap.url()).pathname).toBe("/admin");
      await op.setViewportSize({ width: 1440, height: 1000 });
      await op.goto("/tools");
      await op.getByRole("button", { name: "Perfiles", exact: true }).click();
      await expect(
        op.getByRole("link", { name: /Profesionales/ }),
      ).toHaveAttribute("href", "/perfiles");
      await op.keyboard.press("Escape");
      await op.getByRole("button", { name: "Cuenta", exact: true }).click();
      await expect(
        op.getByRole("link", { name: "Administrar FILMATTA" }),
      ).toHaveCount(0);
      await shot(op, "authenticated-header", 1440);
      for (const route of ["/cuenta/suscripcion", "/billing/return"]) {
        await op.goto(route);
        await expect(op.getByRole("heading", { level: 1 })).toBeVisible();
        expect(new URL(op.url()).origin).toBe(previewBase);
      }
      await op.goto("/tools");
      await op.getByRole("button", { name: "Cuenta", exact: true }).click();
      await op
        .getByRole("button", { name: "Cerrar sesión", exact: true })
        .click();
      await expect(
        op.getByRole("link", { name: "Crear cuenta", exact: true }),
      ).toBeVisible();
      for (const route of [
        "/mis-servicios/nuevo",
        "/mis-oportunidades/nueva",
        "/mis-locaciones/nueva",
        "/mi-perfil",
      ]) {
        await page.goto(route);
        expect(new URL(page.url()).pathname).toMatch(/login|acceso/);
      }
      for (const route of [
        "/cursos",
        "/planes",
        "/cuenta/suscripcion",
        "/billing/return",
      ]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(new URL(page.url()).origin).toBe(previewBase);
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  }));
test("remote desktop/mobile navigation and additional known calculator cases", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name: "Navegación principal",
    exact: true,
  });
  await expect(
    nav.locator('[aria-hidden="true"]').filter({ hasText: "/" }),
  ).toHaveCount(6);
  for (const [label, link, href] of [
    ["Perfiles", "Profesionales", "/descubre/perfiles"],
    ["Oportunidades", "Jobs", "/descubre/jobs"],
    ["Tools", "FILMATTA Writer", "/tools/writer"],
  ]) {
    const button = nav.getByRole("button", { name: label, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(
      nav.getByRole("link", { name: new RegExp(link) }),
    ).toHaveAttribute("href", href);
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  }
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const menu = page.getByRole("button", { name: /Menú/ });
    await menu.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("summary").filter({ hasText: "Perfiles" }).click();
    await dialog.getByRole("link", { name: /Profesionales/ }).click();
    await expect(page).toHaveURL(/descubre\/perfiles/);
    await expect(dialog).not.toBeVisible();
    await menu.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    for (const [slug, values, result] of [
      ["obturacion", { fps: "25", angle: "90" }, "1/100 s"],
      ["almacenamiento", { mbps: "50", minutes: "10", margin: "20" }, "4.5 GB"],
      [
        "relacion-aspecto",
        { known: "1080", ratioWidth: "9", ratioHeight: "16" },
        "1080 × 1920 px",
      ],
      ["focal-equivalente", { focal: "35", crop: "2" }, "70 mm"],
    ]) {
      await page.goto("/tools/utilidades/" + slug);
      for (const [name, value] of Object.entries(values))
        await page.locator(`[name="${name}"]`).fill(value);
      await page.getByRole("button", { name: /Calcular/ }).click();
      await expect(page.locator("dd").filter({ hasText: result })).toHaveCount(
        1,
      );
      await settled(page);
      if (width === 390) await shot(page, "utility-" + slug, width);
    }
  }
  await page.goto("/tools/utilidades/obturacion");
  await page.locator('[name="mode"]').selectOption("time");
  await page.locator('[name="fps"]').fill("24");
  await page.locator('[name="denominator"]').fill("12");
  await page.getByRole("button", { name: /Calcular/ }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "no puede superar",
  );
});

test("remote pagination traverses a populated second page without duplicate rows", async ({
  page,
}) =>
  withTestUsers(async ({ owner, prefix }) => {
    const city = `QA pagination ${prefix.slice(-8)}`;
    checked(
      await owner.client.from("service_listings").insert(
        Array.from({ length: 26 }, (_, i) => ({
          owner_user_id: owner.id,
          slug: `${prefix}-page-${i}`,
          title: `QA pagination ${String(i + 1).padStart(2, "0")}`,
          category: "sound",
          description:
            "Fixture temporal de paginación; no representa un proveedor real.",
          city,
          work_mode: "remote",
          status: "published",
        })),
      ),
    );
    await page.goto(
      `/marketplace?city=${encodeURIComponent(city)}&category=sound`,
    );
    const cards = page.locator('main a[href^="/marketplace/"]');
    await expect(cards).toHaveCount(24);
    const first = await cards.evaluateAll((items) =>
      items.map((a) => a.getAttribute("href")),
    );
    await page.getByRole("link", { name: /Siguiente/ }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(cards).toHaveCount(2);
    const second = await cards.evaluateAll((items) =>
      items.map((a) => a.getAttribute("href")),
    );
    expect(new Set([...first, ...second]).size).toBe(26);
    expect(new URL(page.url()).searchParams.get("city")).toBe(city);
    expect(new URL(page.url()).searchParams.get("category")).toBe("sound");
    await page.getByRole("link", { name: /Anterior/ }).click();
    await expect(cards).toHaveCount(24);
    expect(
      await cards.evaluateAll((items) =>
        items.map((a) => a.getAttribute("href")),
      ),
    ).toEqual(first);
  }));
