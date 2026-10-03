import type { ScreenplayKind } from "./document.ts";

export const WRITER_KIND_SHORTCUTS = [
  { digit: "1", kind: "sceneHeading", label: "Encabezado de escena" },
  { digit: "2", kind: "action", label: "Acción" },
  { digit: "3", kind: "character", label: "Personaje" },
  { digit: "4", kind: "parenthetical", label: "Acotación" },
  { digit: "5", kind: "dialogue", label: "Diálogo" },
  { digit: "6", kind: "transition", label: "Transición" },
  { digit: "9", kind: "authorNote", label: "Nota" },
] as const satisfies ReadonlyArray<{ digit: string; kind: ScreenplayKind; label: string }>;

export function writerKindShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "isComposing" | "getModifierState">, platform: string) {
  if (event.repeat || event.isComposing || event.shiftKey || event.getModifierState("AltGraph")) return null;
  const mac = /Mac|iPhone|iPad/u.test(platform);
  if (!event.altKey || (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)) return null;
  return WRITER_KIND_SHORTCUTS.find((item) => item.digit === event.key)?.kind ?? null;
}

export function writerShortcutLabel(digit: string, platform: string) {
  return /Mac|iPhone|iPad/u.test(platform) ? `⌘⌥${digit}` : `Ctrl+Alt+${digit}`;
}
