"use client";
import type { Viewer } from "@/lib/auth/get-viewer";
import { AccountNavigation } from "@/components/navigation/GlobalNavigation";
export default function AccountDropdown({ viewer }: { viewer: Viewer }) {
  return <AccountNavigation role={viewer.role} />;
}
