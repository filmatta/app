import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(
        process.env.NODE_ENV === "development", process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.VERCEL_ENV === "preview",
      ) },
      {
        source: "/admin/:path*",
        headers: [{
          key: "Cache-Control",
          value: "private, no-store, max-age=0",
        }],
      },
    ];
  },
};

export default nextConfig;
