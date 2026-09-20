// Provider timeouts, not background time, determine abandonment.
export type UploadSnapshot = { status: string; asset_id?: string };
export function uploadDecision(upload: UploadSnapshot) {
  if (upload.asset_id) return "reconcile-asset" as const;
  if (["cancelled", "timed_out", "errored"].includes(upload.status))
    return "terminal" as const;
  return "preserve" as const;
}
export function terminalUploadReason(status: string) {
  return status === "cancelled" ? "cancelled" : status === "timed_out" ? "expired" : "provider-error";
}
export function reelEligible(item: { media_type: string; status: string; source: string; duration_seconds?: number | null }) {
  return item.media_type === "video" && item.status === "ready" && item.source === "mux" &&
    typeof item.duration_seconds === "number" && Number.isFinite(item.duration_seconds) &&
    item.duration_seconds > 0 && item.duration_seconds <= 180;
}
