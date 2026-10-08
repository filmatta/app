export function normalizeManualTagSelection(text: string, from: number, to: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > text.length || to <= from) return null;
  const selected = text.slice(from, to);
  const left = selected.match(/^\s*/u)?.[0].length ?? 0;
  const right = selected.match(/\s*$/u)?.[0].length ?? 0;
  const name = selected.slice(left, selected.length - right);
  if (!name || name.length > 160 || /[.!?\n\r]/u.test(name)) return null;
  return { name, fromOffset: from + left, toOffset: to - right };
}
