export function writerTimelineHref(scriptId: string) {
  return `/writer/${encodeURIComponent(scriptId)}/timeline`;
}

export function writerDocumentHref(scriptId: string, sceneId?: string) {
  const base = `/writer/${encodeURIComponent(scriptId)}`;
  return sceneId ? `${base}?scene=${encodeURIComponent(sceneId)}` : base;
}
