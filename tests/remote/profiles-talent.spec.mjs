import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { withTestUsers, checked } from "../integration/test-project.mjs";
import {
  previewAccess,
  previewBase,
  signedPreviewContext,
} from "./preview-access.mjs";
const evidence = "docs/review/profile-public-ui-v2/preview";
test("real Preview: portfolio surfaces, responsive matrix, filters, privacy and editor roundtrip", async ({
  browser,
  page,
  context,
}) =>
  withTestUsers(async ({ owner, stranger, outsider, anon, prefix }) => {
    fs.mkdirSync(evidence, { recursive: true });
    await previewAccess(context);
    const city = "QA " + prefix.slice(-8);
    const presentation = {
      portrait_url:
        previewBase + "/images/editorial/talent-portrait-13306757.webp",
      stage_name: "Artista QA · referencia editorial",
      work_area: "Zona Poniente",
      rate_range: "MXN 3,000 por jornada",
      book: [
        {
          url: previewBase + "/images/editorial/talent-portrait-13306757.webp",
          caption: "Stock editorial · perfil sintético",
        },
        {
          url: previewBase + "/images/editorial/monitor.webp",
          caption: "Referencia visual de QA",
        },
      ],
      credits: [
        {
          title: "La última luz · ejemplo QA",
          role: "Protagonista",
          year: "2026",
        },
        { title: "Retratos · ejemplo QA", role: "Intérprete", year: "2025" },
      ],
    };
    const args = {
      p_disciplines: ["Actuación", "Modelaje"],
      p_city: city,
      p_bio:
        "Perfil sintético para revisión de FILMATTA. Las imágenes son referencias editoriales y no representan a un miembro real.",
      p_availability: "available",
      p_skills: ["Inglés", "Expresión corporal"],
      p_equipment: [],
      p_portfolio_items: [
        {
          kind: "reel",
          title: "Reel · referencia audiovisual",
          url: "https://vimeo.com/76979871",
          summary:
            "Video de referencia para QA; no trabajo de una persona real.",
        },
        {
          kind: "project",
          title: "Proyecto · ejemplo QA",
          url: "https://example.com",
          summary: "Ejemplo de presentación de trabajo.",
        },
      ],
      p_is_public: true,
      p_contact_policy: "members_only",
      p_presentation: presentation,
    };
    const talent = checked(
      await owner.client.rpc("save_my_professional_portfolio", args),
    );
    const professional = checked(
      await stranger.client.rpc("save_my_professional_portfolio", {
        ...args,
        p_disciplines: ["Dirección de fotografía", "Dirección"],
        p_equipment: ["Cámara y óptica"],
        p_presentation: {
          ...presentation,
          portrait_url: "",
          book: [
            {
              url: previewBase + "/images/editorial/monitor.webp",
              caption: "Trabajo audiovisual · referencia editorial",
            },
          ],
          stage_name: "Dirección de fotografía · QA",
          credits: [
            {
              title: "La última luz · ejemplo QA",
              role: "Fotografía",
              year: "2026",
            },
          ],
        },
      }),
    );
    const draft = checked(
      await outsider.client.rpc("save_my_professional_portfolio", {
        ...args,
        p_is_public: false,
      }),
    );
    const owned = await signedPreviewContext(browser, owner),
      editor = await owned.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    editor.on("pageerror", (e) => errors.push(e.message));
    const matrix = [];
    async function settled(p) {
      await expect(
        p.locator("main:visible").getByRole("heading", { level: 1 }),
      ).toBeVisible();
      await p.evaluate(() => document.fonts.ready);
      for (const img of await p.locator("main img").all()) {
        await img.scrollIntoViewIfNeeded();
        await expect
          .poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0))
          .toBe(true);
      }
      await p.evaluate(() => scrollTo(0, 0));
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(p.locator("main:visible")).not.toContainText(
        /PrivateSurname|@example.invalid|No pudimos cargar|Application error/,
      );
    }
    try {
      for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
        for (const [route, name, p] of [
          ["/descubre/perfiles", "landing-perfiles", page],
          ["/descubre/talento", "landing-talento", page],
          [
            "/perfiles?city=" + encodeURIComponent(city),
            "catalogo-perfiles",
            page,
          ],
          [
            "/talento?city=" + encodeURIComponent(city),
            "catalogo-talento",
            page,
          ],
          ["/perfiles/" + talent, "perfil-talento", page],
          ["/perfiles/" + professional, "perfil-profesional", page],
          ["/mi-perfil", "mi-perfil", editor],
        ]) {
          await p.setViewportSize({ width, height: 1000 });
          await p.goto(route);
          await settled(p);
          await p.evaluate(() => {
            const label = document.createElement("div");
            label.textContent = "PREVIEW REAL · QA SINTÉTICO · STOCK EDITORIAL";
            label.style.cssText =
              "position:fixed;bottom:0;left:0;z-index:9999;background:#142027;color:#b9dceb;font:10px Arial;padding:5px 10px;pointer-events:none";
            document.body.append(label);
          });
          await p.screenshot({
            path: evidence + "/" + name + "-" + width + "-viewport.png",
            animations: "disabled",
          });
          if (width === 390 || width === 1440)
            await p.screenshot({
              path: evidence + "/" + name + "-" + width + ".png",
              fullPage: true,
              animations: "disabled",
            });
          matrix.push({
            route: route.split("?")[0],
            width,
            overflow: false,
            images: "loaded",
          });
        }
      }
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.goto("/talento");
      await expect(
        page.getByRole("button", { name: /Filtros/ }),
      ).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("button", { name: /Filtros/ }).click();
      await page.getByLabel("Ciudad", { exact: true }).fill(city);
      await page
        .getByLabel("Disciplina", { exact: true })
        .selectOption("Modelaje");
      await page.getByRole("button", { name: "Filtrar", exact: true }).click();
      await expect(page.locator(".profile-card")).toHaveCount(1);
      await expect(page.locator(".profile-card")).toHaveAttribute(
        "href",
        "/perfiles/" + talent,
      );
      await page.locator(".profile-card").click();
      await expect(page.locator(".profile-portrait")).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(
        page
          .locator('a[href^="/login?next="]')
          .filter({ hasText: "Contactar" }),
      ).toBeVisible();
      await page.getByRole("button", { name: /Cargar reel/ }).click();
      await expect(page.locator("iframe")).toHaveAttribute(
        "src",
        "https://player.vimeo.com/video/76979871",
      );
      await page.goto("/perfiles/" + draft);
      await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
      await page.goto("/mi-perfil");
      await expect(page).toHaveURL(/login/);
      await page.goto("/perfiles?city=absent-" + prefix);
      await expect(
        page.getByRole("heading", {
          name: "No hay perfiles para esta selección.",
        }),
      ).toBeVisible();
      await page.screenshot({
        path: evidence + "/empty-390.png",
        fullPage: true,
      });
      await editor.setViewportSize({ width: 390, height: 1000 });
      await editor.goto("/mi-perfil");
      await editor
        .getByLabel("Nombre profesional")
        .fill("Alias revisado QA");
      await editor
        .getByRole("button", { name: "Bajar pieza 1", exact: true })
        .click();
      await editor.getByRole("button", { name: "Vista previa ↗" }).click();
      await expect(
        editor
          .getByRole("dialog")
          .getByText("Alias revisado QA", { exact: true }),
      ).toBeVisible();
      await editor.keyboard.press("Escape");
      await editor
        .getByRole("button", { name: "Guardar perfil", exact: true })
        .click();
      await expect(
        editor.getByRole("status").filter({ hasText: "Perfil guardado" }),
      ).toHaveText("Perfil guardado y publicado.");
      const saved = checked(
        await owner.client
          .from("professional_profiles")
          .select("presentation,portfolio_items")
          .eq("user_id", owner.id)
          .single(),
      );
      expect(saved.presentation.stage_name).toBe("Alias revisado QA");
      expect(saved.portfolio_items[0].kind).toBe("project");
      await page.goto("/perfiles/" + talent);
      await expect(
        page.getByText("Alias revisado QA", { exact: true }),
      ).toBeVisible();
      await editor.getByLabel("Publicar mi perfil", { exact: false }).uncheck();
      await editor
        .getByRole("button", { name: "Guardar perfil", exact: true })
        .click();
      await expect(
        editor.getByRole("status").filter({ hasText: "Perfil guardado" }),
      ).toHaveText("Perfil guardado como borrador.");
      expect(
        checked(
          await anon.rpc("get_public_professional_portfolio", {
            p_slug: talent,
          }),
        ),
      ).toEqual([]);
      await page.goto("/perfiles/" + talent);
      await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
      await page.goto("/talento?city=" + encodeURIComponent(city));
      await expect(page.locator(".profile-card")).toHaveCount(0);
      await editor.getByLabel("Publicar mi perfil", { exact: false }).check();
      await editor
        .getByRole("button", { name: "Guardar perfil", exact: true })
        .click();
      await expect(
        editor.getByRole("status").filter({ hasText: "Perfil guardado" }),
      ).toHaveText("Perfil guardado y publicado.");
      await page.goto("/perfiles/" + talent);
      await expect(
        page.getByText("Alias revisado QA", { exact: true }),
      ).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/talento?city=" + encodeURIComponent(city));
      expect(
        await page
          .locator(".profile-card")
          .first()
          .evaluate((e) => getComputedStyle(e).transitionDuration),
      ).toBe("0s");
      expect(errors).toEqual([]);
      fs.writeFileSync(
        evidence + "/matrix.json",
        JSON.stringify(
          {
            preview: previewBase,
            matrix,
            scenarios: [
              "filters",
              "contact gate",
              "lazy reel",
              "draft 404",
              "private preview",
              "real server-action save",
              "reorder",
              "unpublish",
              "republish",
              "empty",
              "reduced motion",
            ],
            pageErrors: errors,
          },
          null,
          2,
        ),
      );
    } finally {
      await owned.close();
    }
  }));
