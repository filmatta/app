import fs from "node:fs";
export const previewBase =
  process.env.FILMATTA_PREVIEW_URL || "http://127.0.0.1:3106";
export async function previewAccess(context) {
  if (!process.env.FILMATTA_PREVIEW_URL) return;
  const url = new URL(previewBase);
  if (
    url.protocol !== "https:" ||
    !/^app-[a-z0-9]+-filmatta\.vercel\.app$/.test(url.hostname)
  )
    throw Error("Only an isolated FILMATTA Preview URL is permitted.");
  const tokenFile = process.env.FILMATTA_PREVIEW_ACCESS_FILE;
  if (tokenFile) {
    const secret = fs.readFileSync(tokenFile, "utf8").trim();
    // The scoped link sets a cookie only for this deployment. Never forward credentials to other hosts.
    const response = await context.request.get(
      `${previewBase}/?_vercel_share=${encodeURIComponent(secret)}`,
    );
    if (new URL(response.url()).origin !== url.origin)
      throw Error("Preview access failed");
  }
}
export async function signedPreviewContext(browser, user) {
  const context = await browser.newContext({
    baseURL: previewBase,
    viewport: { width: 1440, height: 1000 },
  });
  await previewAccess(context);
  const { data, error } = await user.client.auth.getSession();
  if (error) throw error;
  const value =
    "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const chunks = value.match(/.{1,3000}/g);
  await context.addCookies(
    chunks.map((value, i) => ({
      name: `sb-ezlycwkuzkwcnhrhiruv-auth-token${chunks.length > 1 ? "." + i : ""}`,
      value,
      domain: new URL(previewBase).hostname,
      path: "/",
      sameSite: "Lax",
      secure: true,
    })),
  );
  return context;
}
