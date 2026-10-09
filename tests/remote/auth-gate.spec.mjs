import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";
import { previewAccess, previewBase } from "./preview-access.mjs";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";

test("guest Auth routes, redirects, errors and mobile controls stay safe on Test Preview", async ({ browser }) => {
  assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
  assert.match(previewBase, /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/);
  const context = await browser.newContext({ baseURL: previewBase, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await previewAccess(context);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/registro?next=%2Fcreate");
      await expect(page.getByRole("heading", { name: "Crea tu cuenta en FILMATTA" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeVisible();
      await expect(page.getByLabel("Correo")).toBeVisible();
      await expect(page.getByLabel("Contraseña")).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Signup overflow at ${width}`);

      await page.goto("/login?next=%2Fcreate");
      await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Olvidé mi contraseña" })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Login overflow at ${width}`);

      await page.goto("/recuperar-contrasena?next=%2Fcreate");
      await expect(page.getByRole("button", { name: "Enviar enlace" })).toBeVisible();
      await expect(page.getByLabel("Correo")).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Recovery overflow at ${width}`);

      await page.goto("/restablecer-contrasena?next=%2Fcreate");
      await expect(page.getByText("Este enlace ya no es válido o la sesión de recuperación terminó.")).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Reset overflow at ${width}`);
    }

    await page.goto("/registro?next=%2Fcreate&error=signup_limited");
    await expect(page.locator("p[role=alert]")).toContainText("temporalmente limitado");
    await expect(page.getByText("over_email_send_rate_limit")).toHaveCount(0);
    await page.goto("/registro?next=%2Fcreate&error=signup_attempt_limited");
    await expect(page.locator("p[role=alert]")).toContainText("intentos de registro");
    await page.goto("/login?error=over_email_send_rate_limit&message=sensitive-token");
    await expect(page.getByText("over_email_send_rate_limit")).toHaveCount(0);
    await expect(page.getByText("sensitive-token")).toHaveCount(0);

    await page.getByLabel("Correo").fill("unknown-auth-gate@example.invalid");
    await page.getByLabel("Contraseña").fill("incorrect-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("No pudimos iniciar sesión");

    await page.goto("/create");
    await expect(page).toHaveURL(/\/login\?/);
    assert.equal(new URL(page.url()).searchParams.get("next"), "/create");
    const invalid = await context.request.get("/auth/callback?token_hash=invalid-token&type=email&next=https%3A%2F%2Fevil.example", { maxRedirects: 0 });
    assert.equal(invalid.status(), 307);
    assert.equal(new URL(invalid.headers().location).pathname, "/login");
    assert.equal(new URL(invalid.headers().location).searchParams.get("next"), "/create");
    assert.equal(invalid.headers()["referrer-policy"], "no-referrer");
    assert.equal(invalid.headers().location.includes("invalid-token"), false);
    assert.equal(invalid.headers().location.includes("evil.example"), false);

    const invalidRecovery = await context.request.get("/auth/callback?token_hash=invalid-token&type=recovery&next=%2Frestablecer-contrasena%3Fnext%3D%252Fcreate", { maxRedirects: 0 });
    assert.equal(invalidRecovery.status(), 307);
    assert.equal(new URL(invalidRecovery.headers().location).pathname, "/recuperar-contrasena");
    assert.equal(new URL(invalidRecovery.headers().location).searchParams.get("next"), "/create");
    assert.equal(invalidRecovery.headers().location.includes("invalid-token"), false);
  } finally {
    await context.close();
  }
});
