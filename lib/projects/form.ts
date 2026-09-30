import {
  CLIENT_TYPES,
  ECONOMICS,
  PROJECT_STATES,
  PROJECT_TYPES,
  SCHEDULES,
  type Project,
} from "@/lib/networking/types";
import { PROFILE_DISCIPLINES } from "@/lib/profiles/constants";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
import { slugify } from "@/lib/slugify";

export const PROJECT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROJECT_INTENTS = [
  "save",
  "publish",
  "unpublish",
  "archive",
  "restore",
  "create-opportunity",
] as const;
export type ProjectIntent = (typeof PROJECT_INTENTS)[number];

export type ParsedProject = {
  intent: ProjectIntent;
  values: Omit<Project, "id" | "status" | "updated_at" | "cover_image_path">;
  cover: File | null;
  removeCover: boolean;
};

export function parseProjectForm(
  form: FormData,
): { ok: true; value: ParsedProject } | { ok: false; error: string } {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const title = text("title");
  const summary = text("summary");
  const description = text("description");
  const intent = text("intent") || "save";
  const startsOn = text("starts_on") || null;
  const endsOn = text("ends_on") || null;

  if (!PROJECT_INTENTS.includes(intent as ProjectIntent)) {
    return { ok: false, error: "La acción del proyecto no es válida." };
  }
  if (title.length < 1 || title.length > 160) {
    return { ok: false, error: "Escribe un nombre de proyecto de hasta 160 caracteres." };
  }
  if (summary.length > 500 || description.length > 20_000) {
    return { ok: false, error: "La descripción supera el límite permitido." };
  }

  const projectType = text("project_type");
  const clientType = text("client_type");
  const schedule = text("shooting_schedule");
  const economic = text("economic_mode");
  const operational = text("operational_status");
  if (!PROJECT_TYPES.includes(projectType) || !CLIENT_TYPES.includes(clientType)) {
    return { ok: false, error: "Revisa el tipo de proyecto y de cliente." };
  }
  if (!(schedule in SCHEDULES) || !(economic in ECONOMICS) || !(operational in PROJECT_STATES)) {
    return { ok: false, error: "Revisa jornada, modalidad y estado de producción." };
  }

  for (const value of [startsOn, endsOn]) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value < "2000-01-01" ||
        value > "2200-12-31" ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    ) {
      return { ok: false, error: "Usa fechas válidas entre 2000 y 2200." };
    }
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, error: "La fecha final debe ser posterior o igual a la inicial." };
  }

  const roles = [...new Set(form.getAll("roles").map(String))];
  if (
    roles.length > 16 ||
    roles.some((role) => !(PROFILE_DISCIPLINES as readonly string[]).includes(role))
  ) {
    return { ok: false, error: "Revisa las necesidades del proyecto." };
  }

  const requirements = {} as Project["requirements"];
  for (const [group, choices] of Object.entries(PREFERENCE_GROUPS)) {
    const selected = [...new Set(form.getAll(`requirements.${group}`).map(String))];
    if (
      selected.length > 10 ||
      selected.some((item) => !(item in choices))
    ) {
      return { ok: false, error: "Revisa las preferencias del proyecto." };
    }
    requirements[group as keyof Project["requirements"]] = selected;
  }

  const shortFields = [
    ["client_name", 120],
    ["city", 80],
    ["work_area", 80],
    ["date_window", 100],
  ] as const;
  if (shortFields.some(([key, max]) => text(key).length > max)) {
    return { ok: false, error: "Uno de los campos supera el límite indicado." };
  }

  const slug = slugify(text("slug") || title).slice(0, 140);
  if (!slug) {
    return { ok: false, error: "No pudimos generar una URL válida para el proyecto." };
  }
  const file = form.get("cover_image");
  const cover = file instanceof File && file.size > 0 ? file : null;
  if (cover && !["image/jpeg", "image/png", "image/webp"].includes(cover.type)) {
    return { ok: false, error: "La portada debe ser JPG, PNG o WEBP." };
  }
  if (cover && cover.size > 5 * 1024 * 1024) {
    return { ok: false, error: "La portada no puede pesar más de 5 MB." };
  }

  return {
    ok: true,
    value: {
      intent: intent as ProjectIntent,
      cover,
      removeCover: form.get("remove_cover") === "on",
      values: {
        slug,
        title,
        summary: summary || null,
        description: description || null,
        project_type: projectType,
        client_name: text("client_name"),
        share_client_name: form.get("share_client_name") === "on",
        client_type: clientType,
        city: text("city"),
        work_area: text("work_area"),
        shooting_schedule: schedule as Project["shooting_schedule"],
        economic_mode: economic as Project["economic_mode"],
        date_window: text("date_window"),
        starts_on: startsOn,
        ends_on: endsOn,
        dates_confirmed: form.get("dates_confirmed") === "on",
        roles,
        requirements,
        operational_status: operational as Project["operational_status"],
        lifecycle_status: "draft",
        visibility: "private",
      },
    },
  };
}
