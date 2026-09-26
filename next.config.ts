import type { NextConfig } from "next";
import { securityHeaders, writerPdfWorkerHeaderRules } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(
        process.env.NODE_ENV === "development", process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.VERCEL_ENV === "preview",
      ) },
      {
        source: "/mis-locaciones/:id/editar",
        headers: [{
          key: "Permissions-Policy",
          value: "camera=(self), microphone=(self), geolocation=(), payment=()",
        }],
      },
      {
        source: "/admin/:path*",
        headers: [{
          key: "Cache-Control",
          value: "private, no-store, max-age=0",
        }],
      },
      ...writerPdfWorkerHeaderRules(),
    ];
  },
};

export default nextConfig;
