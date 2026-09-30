"use client";

import { useEffect } from "react";
import { emitMonetizationEvent } from "@/lib/entitlements/analytics";
import type { PlanCode } from "@/lib/entitlements/types";

export function PlanPageViewEvent({ currentPlan }: { currentPlan: PlanCode }) {
  useEffect(() => {
    emitMonetizationEvent({ event: "plan_page_viewed", currentPlan });
  }, [currentPlan]);

  return null;
}
