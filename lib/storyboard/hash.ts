import "server-only";
import { createHash } from "node:crypto";
import { storyboardCanonicalPayload, stableStringify } from "./document.ts";
import type { StoryboardDocument } from "./types.ts";

export function storyboardContentHash(document: StoryboardDocument, visualNote: string | null) {
  return sha256(storyboardCanonicalPayload(document, visualNote));
}

export function storyboardShotContextHash(input: {
  subject: string;
  shotType: string;
  composition: string | null;
  angle: string;
  movement: string;
  lens: string | null;
  description: string | null;
  intention: string | null;
  notes: string | null;
  assetId: string | null;
}) {
  return sha256(stableStringify({
    subject: input.subject.trim(),
    shotType: input.shotType.trim(),
    composition: input.composition?.trim() || null,
    angle: input.angle.trim(),
    movement: input.movement.trim(),
    lens: input.lens?.trim() || null,
    description: input.description?.trim() || null,
    intention: input.intention?.trim() || null,
    notes: input.notes?.trim() || null,
    assetId: input.assetId,
  }));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
