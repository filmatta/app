"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
import {
  EMPTY_PRESENTATION,
  parsePresentation,
} from "@/lib/profiles/presentation";
import { getPublicDisplayName } from "@/lib/profiles/display-name";
import { parseMediaInput } from "@/lib/profiles/media";
import type { MediaItem } from "@/lib/profiles/media";
import type { ProfessionalProfile } from "@/lib/profiles/types";

async function session() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new Error("Inicia sesión para editar tu perfil.");
  return { db, user: data.user };
}
async function state() {
  const { db, user } = await session();
  const profile = await getOwnedProfessionalProfile(user.id);
  if (!profile) throw new Error("Guarda primero tu identidad profesional.");
  const { data, error } = await db.rpc("get_profile_media", {
    p_slug: profile.slug,
  });
  if (error) throw new Error("No pudimos cargar los trabajos.");
  return { profile, items: data as MediaItem[] | null };
}
function invalidate(slug: string) {
  revalidatePath(`/perfiles/${slug}`);
  revalidatePath("/perfiles");
  revalidatePath("/talento");
}
function feedback(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "No pudimos guardar el cambio. Inténtalo de nuevo.";
  return { error: message };
}
export async function loadMyPortfolio() {
  try {
    return { data: await state() };
  } catch (e) {
    return feedback(e);
  }
}
export async function startPortfolioEditing() {
  try {
    const { db } = await session();
    const { error } = await db.rpc("initialize_my_profile_media");
    if (error)
      return {
        error: "Guarda primero tu identidad profesional para añadir trabajos.",
      };
    const data = await state();
    invalidate(data.profile.slug);
    return { data };
  } catch (e) {
    return feedback(e);
  }
}
export async function savePortfolioItem(id: string | null, input: unknown) {
  try {
    const { db } = await session();
    let parsed = parseMediaInput(input);
    // Legacy imported links/images remain editable without rewriting their source URL.
    if (!parsed && id && input && typeof input === "object") {
      const { data: existing } = await db
        .from("profile_media")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      const v = input as Record<string, unknown>;
      if (
        existing?.source === "external" &&
        existing.media_type !== "video" &&
        typeof v.title === "string" &&
        v.title.trim() &&
        v.title.length <= 100 &&
        typeof v.role === "string" &&
        v.role.length <= 80 &&
        typeof v.year === "string" &&
        /^(|19\d{2}|20\d{2})$/.test(v.year) &&
        typeof v.description === "string" &&
        v.description.length <= 240 &&
        typeof v.featured === "boolean"
      ) {
        parsed = {
          category: existing.category,
          media_type: existing.media_type,
          source: existing.source,
          url: existing.url,
          title: v.title.trim(),
          role: v.role.trim(),
          year: v.year,
          description: v.description.trim(),
          featured: v.featured,
        };
      }
    }
    if (!parsed)
      return { error: "Revisa título, rol, año y enlace de YouTube o Vimeo." };
    const { error } = await db.rpc("save_my_profile_media", {
      p_id: id,
      p_data: parsed,
    });
    if (error)
      return {
        error:
          "No pudimos guardar el trabajo. Revisa sus datos y vuelve a intentar.",
      };
    const data = await state();
    invalidate(data.profile.slug);
    return { data };
  } catch (e) {
    return feedback(e);
  }
}
export async function managePortfolioItem(
  id: string,
  action: string,
  target: string | null = null,
) {
  try {
    const { db } = await session();
    if (
      ![
        "up",
        "down",
        "feature",
        "hide",
        "show",
        "archive",
        "restore",
        "thumbnail",
      ].includes(action)
    )
      return { error: "Acción no válida." };
    const { error } = await db.rpc("manage_my_profile_media", {
      p_id: id,
      p_action: action,
      p_target: target,
    });
    if (error) return { error: "No pudimos cambiar este trabajo." };
    const data = await state();
    invalidate(data.profile.slug);
    return { data };
  } catch (e) {
    return feedback(e);
  }
}
export async function savePortfolioSection(
  section: string,
  input: Record<string, unknown>,
) {
  try {
    const { db, user } = await session();
    const current = await getOwnedProfessionalProfile(user.id);
    const base: ProfessionalProfile = current ?? {
      slug: "",
      display_name: getPublicDisplayName(
        user.user_metadata.full_name ?? user.user_metadata.name,
      ),
      disciplines: [],
      city: "",
      bio: "",
      availability: "not_specified",
      skills: [],
      equipment: [],
      portfolio_items: [],
      presentation: EMPTY_PRESENTATION,
      contact_policy: "members_only",
      is_public: false,
      updated_at: "",
    };
    const next = { ...base, presentation: { ...base.presentation } };
    if (section === "identity") {
      next.disciplines = Array.isArray(input.disciplines)
        ? input.disciplines.filter((v): v is string => typeof v === "string")
        : [];
      next.city = typeof input.city === "string" ? input.city.trim() : "";
      next.availability =
        input.availability as ProfessionalProfile["availability"];
      next.presentation.stage_name = String(input.name ?? "").trim();
      next.presentation.work_area = String(input.work_area ?? "").trim();
      next.presentation.portrait_url = String(input.portrait_url ?? "").trim();
    } else if (section === "about") next.bio = String(input.bio ?? "").trim();
    else if (section === "credits")
      next.presentation.credits =
        input.credits as typeof next.presentation.credits;
    else if (section === "skills") {
      next.skills = String(input.skills ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      next.equipment = String(input.equipment ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      next.presentation.rate_range = String(input.rate_range ?? "");
    } else if (section === "publication") {
      if (
        typeof input.is_public !== "boolean" ||
        !["closed", "members_only"].includes(String(input.contact_policy))
      )
        return { error: "Revisa la publicación." };
      next.is_public = input.is_public;
      next.contact_policy = input.contact_policy as typeof next.contact_policy;
    } else return { error: "Sección no válida." };
    if (!parsePresentation(next.presentation))
      return { error: "Revisa el nombre, retrato y créditos." };
    const { error } = await db.rpc("save_my_professional_portfolio", {
      p_disciplines: next.disciplines,
      p_city: next.city,
      p_bio: next.bio,
      p_availability: next.availability,
      p_skills: next.skills,
      p_equipment: next.equipment,
      p_portfolio_items: next.portfolio_items,
      p_presentation: next.presentation,
      p_is_public: next.is_public,
      p_contact_policy: next.contact_policy,
    });
    if (error)
      return {
        error:
          "No pudimos guardar. Revisa los campos y tu nombre completo en Mi cuenta.",
      };
    const initialized = await db.rpc("initialize_my_profile_media");
    if (initialized.error)
      return {
        error:
          "La identidad se guardó; vuelve a abrir la edición para cargar los trabajos.",
      };
    const data = await state();
    invalidate(data.profile.slug);
    return { data };
  } catch (e) {
    return feedback(e);
  }
}
