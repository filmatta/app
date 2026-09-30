import type { NextConfig } from "next";
import path from "node:path";
import { createRequire } from "node:module";
import { securityHeaders, writerPdfAssetHeaderRules } from "./lib/security/headers";

const require = createRequire(import.meta.url);
const dependencyRoot = path.dirname(
  path.dirname(path.dirname(require.resolve("next/package.json")))
);
const projectRoot = path.resolve(process.cwd());
const turbopackRoot = commonAncestor(projectRoot, dependencyRoot);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: turbopackRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(
          process.env.NODE_ENV === "development",
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.VERCEL_ENV === "preview",
        ),
      },
      {
        source: "/mis-locaciones/:id/editar",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0",
          },
        ],
      },
      ...writerPdfAssetHeaderRules(),
    ];
  },
};

function commonAncestor(firstPath: string, secondPath: string) {
  let candidate = firstPath;

  while (!containsPath(candidate, secondPath)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return path.parse(firstPath).root;
    candidate = parent;
  }

  return candidate;
}

function containsPath(parentPath: string, childPath: string) {
  const relative = path.relative(parentPath, childPath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export default nextConfig;
