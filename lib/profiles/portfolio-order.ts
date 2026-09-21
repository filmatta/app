import type { MediaItem } from "./media";
export function portfolioGroups(items: MediaItem[]) {
  const ordered = [...items].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  // Imported legacy reels remain playable without silently changing stored selections.
  const reel = ordered.find(i => i.category === "reel" && i.media_type !== "image" && i.status === "ready");
  return {
    reel: reel ? [reel] : [],
    work: ordered.filter(i => i.media_type !== "image" && i !== reel),
    book: ordered.filter(i => i.media_type === "image"),
  };
}
