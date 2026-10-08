const PRODUCTION_HOSTS = new Set(["app.filmatta.com", "staging.filmatta.com"]);

/** Use only the current application's host for email and OAuth callbacks. */
export function getAuthCallbackOrigin(requestHeaders: Headers): string | null {
  const rawOrigin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!rawOrigin || !host) return null;

  try {
    const origin = new URL(rawOrigin);
    if (origin.host !== host || origin.pathname !== "/" || origin.search || origin.hash) return null;
    if (origin.protocol === "http:" && process.env.NODE_ENV !== "production"
      && (host === "localhost:3000" || host === "127.0.0.1:3000")) return origin.origin;
    if (origin.protocol !== "https:") return null;

    const deploymentHost = process.env.VERCEL_URL?.replace(/^https?:\/\//, "");
    const branchHost = process.env.VERCEL_BRANCH_URL?.replace(/^https?:\/\//, "");
    return PRODUCTION_HOSTS.has(host) || host === deploymentHost || host === branchHost
      ? origin.origin : null;
  } catch {
    return null;
  }
}
