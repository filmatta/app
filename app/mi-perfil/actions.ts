"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PROFILE_LIMITS } from "@/lib/profiles/constants";
import type {
  AvailabilityStatus,
  ContactPolicy,
  PortfolioItem,
} from "@/lib/profiles/types";
import { createClient } from "@/lib/supabase/server";

const availabilityValues = new Set<AvailabilityStatus>([
  "available",
  "limited",
  "unavailable",
  "not_specified",
]);

const contactPolicyValues = new Set<ContactPolicy>([
  "members_only",
  "closed",
]);

export async function saveProfessionalProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    redirect("/login?next=%2Fmi-perfil");
  }

  const fullName = readFullName(user.user_metadata);

  if (!fullName) {
    redirect(profileFeedback("error", "Agrega primero tu nombre completo en Mi cuenta"));
  }

  const disciplines = uniqueStrings(formData.getAll("disciplines"));
  const city = cleanOptionalText(formData.get("city"));
  const bio = cleanOptionalText(formData.get("bio"));
  const skills = parseList(formData.get("skills"));
  const equipment = parseList(formData.get("equipment"));
  const availability = String(formData.get("availability") ?? "");
  const contactPolicy = String(formData.get("contact_policy") ?? "");
  const isPublic = formData.get("is_public") === "on";
  const portfolioResult = parsePortfolioItems(formData.get("portfolio_items"));

  if (
    disciplines.length === 0 ||
    disciplines.length > PROFILE_LIMITS.disciplines ||
    disciplines.some((item) => item.length > 80)
  ) {
    redirect(
      profileFeedback(
        "error",
        `Elige entre 1 y ${PROFILE_LIMITS.disciplines} disciplinas`
      )
    );
  }

  if (city && city.length > PROFILE_LIMITS.city) {
    redirect(profileFeedback("error", "La ciudad es demasiado larga"));
  }

  if (bio && bio.length > PROFILE_LIMITS.bio) {
    redirect(profileFeedback("error", "La bio es demasiado larga"));
  }

  if (
    skills.length > PROFILE_LIMITS.skills ||
    skills.some((item) => item.length > 80)
  ) {
    redirect(
      profileFeedback(
        "error",
        `Añade hasta ${PROFILE_LIMITS.skills} skills de 80 caracteres o menos`
      )
    );
  }

  if (
    equipment.length > PROFILE_LIMITS.equipment ||
    equipment.some((item) => item.length > 100)
  ) {
    redirect(
      profileFeedback(
        "error",
        `Añade hasta ${PROFILE_LIMITS.equipment} equipos o sistemas`
      )
    );
  }

  if (!availabilityValues.has(availability as AvailabilityStatus)) {
    redirect(profileFeedback("error", "Selecciona una disponibilidad válida"));
  }

  if (!contactPolicyValues.has(contactPolicy as ContactPolicy)) {
    redirect(profileFeedback("error", "Selecciona una preferencia de contacto válida"));
  }

  if (!portfolioResult.ok) {
    redirect(profileFeedback("error", portfolioResult.error));
  }

  const { data: slug, error } = await supabase.rpc(
    "save_my_professional_profile",
    {
      p_disciplines: disciplines,
      p_city: city,
      p_bio: bio,
      p_availability: availability,
      p_skills: skills,
      p_equipment: equipment,
      p_portfolio_items: portfolioResult.items,
      p_is_public: isPublic,
      p_contact_policy: contactPolicy,
    }
  );

  if (error) {
    console.error("Error guardando el perfil profesional:", error);
    redirect(profileFeedback("error", "No pudimos guardar tu perfil"));
  }

  revalidatePath("/perfiles");
  revalidatePath("/mi-perfil");

  if (typeof slug === "string" && slug) {
    revalidatePath(`/perfiles/${slug}`);
  }

  redirect(profileFeedback("saved", isPublic ? "published" : "draft"));
}

function parsePortfolioItems(
  value: FormDataEntryValue | null
): { ok: true; items: PortfolioItem[] } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: true, items: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, error: "Revisa los enlaces del portafolio" };
  }

  if (!Array.isArray(parsed) || parsed.length > PROFILE_LIMITS.portfolioItems) {
    return {
      ok: false,
      error: `Puedes agregar hasta ${PROFILE_LIMITS.portfolioItems} enlaces`,
    };
  }

  const items: PortfolioItem[] = [];

  for (const entry of parsed) {
    if (!isRecord(entry)) {
      return { ok: false, error: "Revisa los enlaces del portafolio" };
    }

    const kind = entry.kind;
    const title = cleanRequiredText(entry.title, PROFILE_LIMITS.itemTitle);
    const url = cleanRequiredText(entry.url, PROFILE_LIMITS.itemUrl);
    const summary = cleanOptionalText(entry.summary);

    if (
      (kind !== "reel" && kind !== "project" && kind !== "link") ||
      !title ||
      !url ||
      !isSafeWebUrl(url) ||
      (summary?.length ?? 0) > PROFILE_LIMITS.itemSummary
    ) {
      return {
        ok: false,
        error: "Cada enlace necesita tipo, título y una URL http o https válida",
      };
    }

    items.push({ kind, title, url, ...(summary ? { summary } : {}) });
  }

  return { ok: true, items };
}

function parseList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return uniqueStrings(value.split(/[\n,]/u));
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }

    const clean = value.trim().replace(/\s+/gu, " ");
    const key = clean.toLocaleLowerCase("es-MX");

    if (!clean || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [clean];
  });
}

function cleanRequiredText(value: unknown, maxLength: number) {
  const clean =
    typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  return clean && clean.length <= maxLength ? clean : null;
}

function cleanOptionalText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const clean = value.trim().replace(/\r\n?/gu, "\n");
  return clean;
}

function readFullName(metadata: unknown) {
  if (!isRecord(metadata)) {
    return null;
  }

  return cleanRequiredText(metadata.full_name ?? metadata.name, 80);
}

function isSafeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profileFeedback(key: "saved" | "error", value: string) {
  const searchParams = new URLSearchParams({ [key]: value });
  return `/mi-perfil?${searchParams.toString()}`;
}
