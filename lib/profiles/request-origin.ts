import "server-only";
/** Next may rebuild request.url with an internal host. Use the actual HTTP Host. */
export function portfolioRequestOrigin(request: Request) {
  try {
    const raw = request.headers.get("origin");
    if (!raw) return null;
    const origin = new URL(raw);
    const host = request.headers.get("host");
    if (origin.host !== host || origin.username || origin.password) return null;
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        process.env.NODE_ENV === "development" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      )
    )
      return null;
    return origin.origin;
  } catch {
    return null;
  }
}
