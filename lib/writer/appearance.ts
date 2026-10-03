export type WriterSkin = "carbon" | "navy" | "cream";

export type WriterAppearance = {
  skin: WriterSkin;
  warmFilter: boolean;
  warmIntensity: number;
};

export const WRITER_APPEARANCE_DEFAULTS: WriterAppearance = {
  skin: "carbon",
  warmFilter: false,
  warmIntensity: 8,
};

export function writerAppearanceStorageKey(userId: string) {
  return `filmatta.writer.appearance.v1:${userId}`;
}

export function parseWriterAppearance(value: string | null): WriterAppearance {
  if (!value) return { ...WRITER_APPEARANCE_DEFAULTS };
  try {
    const parsed = JSON.parse(value) as Partial<WriterAppearance> | null;
    const skin = parsed?.skin;
    return {
      skin: skin === "navy" || skin === "cream" || skin === "carbon" ? skin : "carbon",
      warmFilter: parsed?.warmFilter === true,
      warmIntensity: Math.max(4, Math.min(14, Math.round(Number(parsed?.warmIntensity) || 8))),
    };
  } catch {
    return { ...WRITER_APPEARANCE_DEFAULTS };
  }
}
