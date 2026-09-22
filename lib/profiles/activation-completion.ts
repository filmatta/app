import type { ProfessionalProfile } from "./types";
import type { MediaItem } from "./media";
import type { ProjectPreferences } from "./project-preferences";
import { isTalent, professionalName, isSafeHttpsUrl } from "./presentation";
export function activationCompletion(
  profile: ProfessionalProfile | null,
  items: MediaItem[] | null = null,
  preferences?: ProjectPreferences | null,
) {
  const p = profile?.presentation;
  const ready = (items ?? []).filter(
    (i) =>
      i.status === "ready" &&
      i.visibility !== "archived" &&
      (!i.purpose || i.purpose === "portfolio"),
  );
  const talent = isTalent(profile?.disciplines ?? []);
  const visual =
    talent ||
    profile?.disciplines.some((d) =>
      [
        "Dirección",
        "Dirección de fotografía",
        "Cámara",
        "Edición",
        "Color",
        "VFX",
        "Animación",
        "Foto fija",
      ].includes(d),
    );
  const hasReel =
    items === null
      ? profile?.portfolio_items.some((i) => i.kind === "reel" && i.url)
      : ready.some((i) => i.category === "reel");
  const hasBook =
    items === null
      ? Boolean(p?.book.length)
      : ready.some((i) => i.category === "book");
  const hasWork = items === null
    ? Boolean(profile?.portfolio_items.some(i => i.kind === "project" && i.url))
    : ready.some(i => i.category === "work");
  const pref = Boolean(
    preferences &&
      (preferences.formats.length ||
        preferences.open_formats ||
        Object.values(preferences.conditions).some(
          (v) => v !== "unspecified",
        ) ||
        Object.values(preferences.themes).some((v) => v !== "unspecified") ||
        Object.values(preferences.participation).some(
          (v) => v !== "unspecified",
        )),
  );
  const checks = [
    {
      key: "identity",
      label: "Identidad y ciudad",
      done: Boolean(
        profile &&
          professionalName(profile).trim() &&
          profile.disciplines.length &&
          profile.city?.trim(),
      ),
    },
    {
      key: "photo",
      label: "Agregar foto",
      done: Boolean(
        p?.portrait_media_id ||
          (p?.portrait_url && isSafeHttpsUrl(p.portrait_url)),
      ),
    },
    {
      key: "about",
      label: "Completar bio",
      done: Boolean(profile?.bio?.trim()),
    },
    {
      key: "availability",
      label: "Disponibilidad",
      done: Boolean(profile && profile.availability !== "not_specified"),
    },
    { key: "preferences", label: "Preferencias", done: pref },
    ...(visual
      ? [
          {
            key: "reel",
            label: talent
              ? "Agregar Reel o video"
              : "Agregar trabajo audiovisual",
            done: Boolean(
              hasReel ||
                hasWork ||
                (profile?.disciplines.includes("Foto fija") && hasBook),
            ),
          },
          { key: "book", label: "Agregar Book", done: Boolean(hasBook) },
        ]
      : [
          {
            key: "skills",
            label: "Habilidades / equipo",
            done: Boolean(profile?.skills.length || profile?.equipment.length),
          },
        ]),
    {
      key: "credits",
      label: "Construir CV",
      done: Boolean(p?.credits.length),
    },
  ];
  return {
    checks,
    percent: Math.round(
      (checks.filter((c) => c.done).length / checks.length) * 100,
    ),
  };
}
