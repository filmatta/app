import type { MattiPose } from "./types";

const FALLBACK_POSE = "/brand/matti/matti-neutral-transparent.png";

export const MATTI_POSE_ASSETS: Record<MattiPose, string> = {
  neutral: FALLBACK_POSE,
  focused: FALLBACK_POSE,
  thinking: FALLBACK_POSE,
  happy: FALLBACK_POSE,
  curious: FALLBACK_POSE,
  agree: FALLBACK_POSE,
};
