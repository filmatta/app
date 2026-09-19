import type { ReactNode } from "react";
import { headers } from "next/headers";
import AdminRouteRevalidator from "./AdminRouteRevalidator";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const requestPath = (await headers()).get("x-filmatta-request-path");
  const nextPath = getSafeNextPath(requestPath, "/admin");

  await requireAdmin(nextPath);

  return (
    <>
      <AdminRouteRevalidator />
      {children}
    </>
  );
}
