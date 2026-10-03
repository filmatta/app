import type { WriterCharacterObservation } from "./character-observations.ts";

export function orderedCharacterAppearances<T extends Pick<WriterCharacterObservation, "id" | "sceneId" | "blockId" | "start">>(
  appearances: readonly T[],
  sceneOrder: readonly string[],
): T[] {
  const sceneIndex = new Map(sceneOrder.map((id, index) => [id, index]));
  return appearances.map((appearance, sourceIndex) => ({ appearance, sourceIndex })).sort((left, right) => {
    const leftScene = left.appearance.sceneId ? sceneIndex.get(left.appearance.sceneId) : undefined;
    const rightScene = right.appearance.sceneId ? sceneIndex.get(right.appearance.sceneId) : undefined;
    return (leftScene ?? Number.MAX_SAFE_INTEGER) - (rightScene ?? Number.MAX_SAFE_INTEGER)
      || left.appearance.blockId.localeCompare(right.appearance.blockId)
      || left.appearance.start - right.appearance.start
      || left.sourceIndex - right.sourceIndex;
  }).map(({ appearance }) => appearance);
}

export function nearestCharacterAppearanceIndex<T extends Pick<WriterCharacterObservation, "sceneId" | "blockId">>(
  appearances: readonly T[],
  activeSceneId: string | null,
  selectedBlockId: string | null,
  sceneOrder: readonly string[],
) {
  if (!appearances.length) return 0;
  if (selectedBlockId) {
    const selected = appearances.findIndex((appearance) => appearance.blockId === selectedBlockId);
    if (selected >= 0) return selected;
  }
  if (!activeSceneId) return 0;
  const target = sceneOrder.indexOf(activeSceneId);
  if (target < 0) return 0;
  let bestIndex = 0;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  appearances.forEach((appearance, index) => {
    const scene = appearance.sceneId ? sceneOrder.indexOf(appearance.sceneId) : -1;
    if (scene < 0) return;
    const distance = Math.abs(scene - target);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}
