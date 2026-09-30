import type { NextConfig } from "next";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dependencyRoot = path.dirname(
  path.dirname(path.dirname(require.resolve("next/package.json")))
);

const nextConfig: NextConfig = {
  // Keeps Turbopack hermetic while allowing Git worktrees to share the
  // repository's installed dependencies. In the primary checkout this resolves
  // to the normal project root.
  turbopack: {
    root: dependencyRoot,
  },
};

export default nextConfig;
