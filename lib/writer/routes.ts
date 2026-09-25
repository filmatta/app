export function writerTimelineHref(scriptId: string) {
  return `/writer/${encodeURIComponent(scriptId)}/timeline`;
}
