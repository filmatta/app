import type { ReactNode } from "react";
import { getPlanVisual } from "@/lib/plan-visuals";
export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info" | "pro" | "plus";
export default function StatusBadge({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  const plan = tone === "pro" || tone === "plus";
  return <span className={`status-badge ${plan ? getPlanVisual(tone).badgeClassName : ""}`} data-tone={tone}>{children}</span>;
}
