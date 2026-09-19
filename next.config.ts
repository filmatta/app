import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(
      process.env.NODE_ENV === "development", process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.VERCEL_ENV === "preview",
    ) }];
  },
};

export default nextConfig;
