"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
import {
  EMPTY_PRESENTATION,
  parsePresentation,
} from "@/lib/profiles/presentation";
import { getPublicDisplayName } from "@/lib/profiles/display-name";
import { analyzeBio, BIO_CONTACT_MESSAGE } from "@/lib/profiles/bio-policy";
import { parseRate } from "@/lib/profiles/rate";
import { parseMediaInput } from "@/lib/profiles/media";
import type { MediaItem } from "@/lib/profiles/media";
import type { ProfessionalProfile } from "@/lib/profiles/types";
import { cleanDiscardedReelCovers } from "@/lib/profiles/reel-cover-cleanup";

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
type PortfolioResult =
  { data: Awaited<ReturnType<typeof state>> } | { error: string };
export async function saveReelCover(reel: string, custom: string | null, book: string | null): Promise<PortfolioResult> {
  try {
    const { db, user } = await session();
    const { error } = await db.rpc("set_my_reel_cover", { p_reel: reel, p_custom: custom, p_book: book });
    if (error) return { error: "No pudimos guardar la portada del Reel. La anterior se conserva." };
    // A cleanup outage does not undo the committed selection; cron retries its queue.
    await cleanDiscardedReelCovers(user.id).catch(() => undefined);
    const data = await state(); invalidate(data.profile.slug); return { data };
  } catch (error) { return feedback(error); }
}
export async function discardReelCover(id: string) {
  const { db, user } = await session();
  const result = await db.rpc("discard_my_reel_cover", { p_id: id });
  if (result.error) return { error: "No se pudo descartar esta portada." };
  await cleanDiscardedReelCovers(user.id).catch(() => undefined);
  return { success: true };
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
export async function loadMyPortfolio(): Promise<PortfolioResult> {
  try {
    return { data: await state() };
  } catch (e) {
    return feedback(e);
  }
}
export async function startPortfolioEditing(): Promise<PortfolioResult> {
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
export async function savePortfolioItem(
  id: string | null,
  input: unknown,
): Promise<PortfolioResult> {
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
): Promise<PortfolioResult> {
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
        "reel",
        "other-video",
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
): Promise<PortfolioResult> {
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
      if (typeof input.portrait_url === "string") next.presentation.portrait_url = input.portrait_url.trim();
      next.presentation.portfolio_mode = input.portfolio_mode as typeof next.presentation.portfolio_mode;
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
      const rate = input.amount ? parseRate({ amount: String(input.amount), currency: input.currency, unit: input.unit }) : null;
      if (rate === false) return { error: "Revisa importe, moneda y unidad de la tarifa." };
      next.presentation.rate = rate;
      if (input.clear_legacy_rate === "on") next.presentation.rate_range = "";
    } else if (section === "publication") {
      if (
        typeof input.is_public !== "boolean" ||
        !["closed", "members_only"].includes(String(input.contact_policy))
      )
        return { error: "Revisa la publicación." };
      next.is_public = input.is_public;
      next.contact_policy = input.contact_policy as typeof next.contact_policy;
    } else return { error: "Sección no válida." };
    if ((next.bio ?? "") !== (base.bio ?? "") && analyzeBio(next.bio ?? "").blocked) return { error: BIO_CONTACT_MESSAGE };
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

export async function saveIdentityImage(kind: "portrait" | "cover", id: string | null): Promise<PortfolioResult> {
  try {
    const { db } = await session();
    const { error } = await db.rpc("set_my_profile_identity_image", { p_kind: kind, p_id: id });
    if (error) return { error: "No pudimos guardar la imagen. La anterior se conserva." };
    const data = await state(); invalidate(data.profile.slug); return { data };
  } catch (error) { return feedback(error); }
}
