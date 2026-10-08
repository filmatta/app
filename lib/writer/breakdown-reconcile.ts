type AutomaticAppearance = {
  id: string;
  element_id: string;
  scene_id: string | null;
  block_id: string | null;
  from_offset: number | null;
  nature: string;
  source_hash: string;
};

export function currentBreakdownEvidenceKey(fingerprint: string, blockId: string | null, fromOffset: number | null, nature: string) {
  return [fingerprint, blockId, fromOffset ?? "", nature].join("|");
}

export function staleAutomaticAppearanceIds(
  appearances: readonly AutomaticAppearance[],
  fingerprints: ReadonlyMap<string, string>,
  currentEvidenceKeys: ReadonlySet<string>,
  sceneIds?: ReadonlySet<string>,
) {
  return appearances.filter((appearance) => {
    if (appearance.source_hash === "0".repeat(64)) return false; // Manual evidence is human-authored.
    if (sceneIds?.size && !sceneIds.has(String(appearance.scene_id))) return false;
    const fingerprint = fingerprints.get(String(appearance.element_id));
    return fingerprint !== undefined && !currentEvidenceKeys.has(currentBreakdownEvidenceKey(fingerprint, appearance.block_id, appearance.from_offset, appearance.nature));
  }).map((appearance) => appearance.id);
}
