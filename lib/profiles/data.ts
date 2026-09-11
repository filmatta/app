import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  PortfolioItem,
  ProfessionalProfile,
  PublicProfessionalProfile,
} from "@/lib/profiles/types";

const profileColumns =
  "slug, display_name, disciplines, city, bio, availability, skills, equipment, portfolio_items, contact_policy, is_public, updated_at";

export async function getOwnedProfessionalProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("professional_profiles")
    .select(profileColumns)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error cargando el perfil profesional propio:", error);
    return null;
  }

  return normalizeProfessionalProfile(data);
}

export const getPublicProfessionalProfile = cache(async (slug: string) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_public_professional_profile",
    { p_slug: slug }
  );

  if (error) {
    console.error("Error cargando el perfil profesional público:", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const profile = normalizeProfessionalProfile(row);

  if (!profile) {
    return null;
  }

  return {
    slug: profile.slug,
    display_name: profile.display_name,
    disciplines: profile.disciplines,
    city: profile.city,
    bio: profile.bio,
    availability: profile.availability,
    skills: profile.skills,
    equipment: profile.equipment,
    portfolio_items: profile.portfolio_items,
    contact_policy: profile.contact_policy,
    updated_at: profile.updated_at,
  } satisfies PublicProfessionalProfile;
});

function normalizeProfessionalProfile(value: unknown): ProfessionalProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const slug = asString(value.slug);
  const displayName = asString(value.display_name);

  if (!slug || !displayName) {
    return null;
  }

  return {
    slug,
    display_name: displayName,
    disciplines: asStringArray(value.disciplines),
    city: asNullableString(value.city),
    bio: asNullableString(value.bio),
    availability: isAvailability(value.availability)
      ? value.availability
      : "not_specified",
    skills: asStringArray(value.skills),
    equipment: asStringArray(value.equipment),
    portfolio_items: normalizePortfolioItems(value.portfolio_items),
    contact_policy:
      value.contact_policy === "closed" ? "closed" : "members_only",
    is_public: value.is_public === true,
    updated_at: asString(value.updated_at) ?? new Date(0).toISOString(),
  };
}

function normalizePortfolioItems(value: unknown): PortfolioItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const title = asString(item.title);
    const url = asString(item.url);
    const kind = item.kind;

    if (
      !title ||
      !url ||
      (kind !== "reel" && kind !== "project" && kind !== "link")
    ) {
      return [];
    }

    const normalizedKind: PortfolioItem["kind"] = kind;
    const summary = asNullableString(item.summary);
    return [{ kind: normalizedKind, title, url, ...(summary ? { summary } : {}) }];
  });
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value: unknown) {
  return asString(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.trim() !== ""
      )
    : [];
}

function isAvailability(value: unknown): value is ProfessionalProfile["availability"] {
  return (
    value === "available" ||
    value === "limited" ||
    value === "unavailable" ||
    value === "not_specified"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
