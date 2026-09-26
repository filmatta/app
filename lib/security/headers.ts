// Inline scripts are currently required by Next's prerendered hydration payloads.
// Move to per-request nonces only together with a deliberate rendering change.
export function securityHeaders(development = false, supabaseUrl?: string, preview = false) {
  const connections = ["'self'", "https://*.mux.com", "https://*.litix.io", "https://storage.googleapis.com"];
  const toolbar = preview ? " https://vercel.live" : "";
  if (preview) connections.push("https://vercel.live", "wss://ws-us3.pusher.com");
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    connections.push(url.origin, url.origin.replace(/^http/, "ws"));
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://src.litix.io${toolbar}${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    `style-src 'self' 'unsafe-inline'${toolbar}`,
    "img-src 'self' data: blob: https:",
    `font-src 'self' data:${toolbar}${preview ? " https://assets.vercel.com" : ""}`,
    `connect-src ${connections.join(" ")}`,
    "media-src 'self' blob: https://*.mux.com",
    "worker-src 'self' blob:",
    `frame-src https://player.mux.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com${toolbar}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ];
}

export function writerPdfWorkerHeaderRules() {
  return [
    "/_next/static/chunks/:worker(turbopack-worker-[A-Za-z0-9_-]+\\.js)",
    "/_next/static/immutable/chunks/:worker(turbopack-worker-[A-Za-z0-9_-]+\\.js)",
  ].map((source) => ({
    // Turbopack emits the PDF worker behind a hashed bootstrap. The Writer
    // referrer keeps the override away from other current and future routes.
    source,
    has: [{
      type: "header" as const,
      key: "referer",
      value: "https?://[^/]+/writer(?:/.*)?",
    }],
    headers: [{
      key: "Content-Security-Policy",
      value: [
        "default-src 'none'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "connect-src 'self'",
        "worker-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
      ].join("; "),
    }],
  }));
}
