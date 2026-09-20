import { test, expect } from "@playwright/test";
test("visual loading, empty and error states at desktop and mobile", async ({
  page,
  request,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await request.get(
      "http://127.0.0.1:54329/__scenario?value=profiles-polish&delay=5000",
    );
    await page.goto("/perfiles", { waitUntil: "commit" });
    await expect(
      page.getByRole("status").filter({ hasText: "Cargando perfiles" }),
    ).toBeVisible();
    await page.addStyleTag({
      content: "nextjs-portal { display:none !important; }",
    });
    await page.screenshot({
      caret: "initial",
      path: `docs/review/profile-public-ui-v2/states/loading-${width}.png`,
      animations: "disabled",
    });
    await expect(
      page.locator("main").getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await request.get("http://127.0.0.1:54329/__scenario?value=empty");
    await page.goto("/talento");
    await expect(
      page.getByRole("heading", {
        name: "El próximo rostro puede ser el tuyo.",
      }),
    ).toBeVisible();
    await page.addStyleTag({
      content: "nextjs-portal { display:none !important; }",
    });
    await page.screenshot({
      caret: "initial",
      path: `docs/review/profile-public-ui-v2/states/empty-${width}.png`,
      fullPage: true,
    });
    await request.get("http://127.0.0.1:54329/__scenario?value=failure");
    await page.goto("/perfiles");
    await expect(
      page.getByText("No pudimos cargar el catálogo."),
    ).toBeVisible();
    await page.addStyleTag({
      content: "nextjs-portal { display:none !important; }",
    });
    await page.screenshot({
      caret: "initial",
      path: `docs/review/profile-public-ui-v2/states/error-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
