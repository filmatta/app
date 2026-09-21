export const PROJECT_FORMATS = ["Cortometraje", "Largometraje", "Series", "Documental", "Publicidad", "Videoclip", "Contenido digital", "Eventos", "Fotografía"] as const;
export const PREFERENCE_GROUPS = {
  themes: { romance: "Romance", comedy: "Comedia", drama: "Drama", horror: "Terror / suspenso", violence: "Violencia dramatizada", gore: "Gore simulado" },
  participation: { kissing: "Besos", contact: "Contacto físico", intimacy_without_contact: "Intimidad simulada sin contacto", intimacy_with_contact: "Intimidad simulada con contacto", partial_nudity: "Desnudez parcial", nudity: "Desnudez total" },
  conditions: { action: "Acción física / coreografía", prop_weapons: "Armas de utilería", water_heights: "Trabajo en agua o alturas", animals: "Trabajo con animales", night: "Rodaje nocturno", travel: "Desplazamientos" },
} as const;
export const PREFERENCE_CHOICES = { unspecified: "Sin especificar", accept: "Sí", consult: "Consultar", decline: "No" } as const;
export type PreferenceChoice = keyof typeof PREFERENCE_CHOICES;
export type ProjectPreferences = { formats: string[]; open_formats: boolean } & Record<keyof typeof PREFERENCE_GROUPS, Record<string, PreferenceChoice>>;
export const EMPTY_PREFERENCES: ProjectPreferences = { formats: [], open_formats: false, themes: {}, participation: {}, conditions: {} };
export function parseProjectPreferences(value: unknown): ProjectPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["formats", "open_formats", ...Object.keys(PREFERENCE_GROUPS)].includes(k)) ||
    typeof v.open_formats !== "boolean" || !Array.isArray(v.formats) || v.formats.length > 9 ||
    v.formats.some(f => typeof f !== "string" || !PROJECT_FORMATS.includes(f as typeof PROJECT_FORMATS[number])) || new Set(v.formats).size !== v.formats.length) return null;
  const result: ProjectPreferences = { formats: [...v.formats], open_formats: v.open_formats, themes: {}, participation: {}, conditions: {} };
  for (const group of Object.keys(PREFERENCE_GROUPS) as (keyof typeof PREFERENCE_GROUPS)[]) {
    const fields = v[group];
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
    for (const [key, choice] of Object.entries(fields)) {
      if (!Object.hasOwn(PREFERENCE_GROUPS[group], key) || typeof choice !== "string" || !Object.hasOwn(PREFERENCE_CHOICES, choice)) return null;
      result[group][key] = choice as PreferenceChoice;
    }
  }
  return result;
}
