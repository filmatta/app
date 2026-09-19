import "server-only";

import type { MuxEnvironmentExpectation } from "./environment";

export type StoredMuxProvenance = {
  mux_environment_id: string | null;
  mux_environment_type: string | null;
};

export function hasMuxEnvironmentProvenance(
  video: StoredMuxProvenance,
): boolean {
  return Boolean(video.mux_environment_id && video.mux_environment_type);
}

export function muxEnvironmentMatches(
  video: StoredMuxProvenance,
  expected: MuxEnvironmentExpectation,
): boolean {
  return (
    video.mux_environment_id === expected.id &&
    video.mux_environment_type === expected.type
  );
}

export function assertMuxEnvironmentProvenance(
  video: StoredMuxProvenance,
  expected: MuxEnvironmentExpectation,
) {
  if (!muxEnvironmentMatches(video, expected)) {
    throw new Error("Mux video belongs to an unexpected environment.");
  }
}
