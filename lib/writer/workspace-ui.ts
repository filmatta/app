export const WRITER_TIMELINE_DESKTOP_QUERY = "(min-width: 1024px)";

export function writerTimelineStartsOpen(desktopViewport: boolean) {
  return desktopViewport;
}

export function writerTimelineRestoresAfterFocus(wasOpen: boolean, desktopViewport: boolean) {
  return wasOpen && desktopViewport;
}
