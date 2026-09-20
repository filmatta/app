import type { PortfolioItem, ProfessionalProfile } from "./types";

export type ProfileCredit = { title: string; role: string; year: string };
export type ProfilePresentation = {
  portrait_url: string;
  stage_name: string;
  work_area: string;
  rate_range: string;
  book: { url: string; caption: string }[];
  credits: ProfileCredit[];
};
export const EMPTY_PRESENTATION: ProfilePresentation = {
  portrait_url: "",
  stage_name: "",
  work_area: "",
  rate_range: "",
  book: [],
  credits: [],
};
export function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function parsePresentation(value: unknown): ProfilePresentation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof p[key] === "string" && p[key].length <= max ? p[key].trim() : null;
  const portrait = text("portrait_url", 500),
    stage = text("stage_name", 80);
  const area = text("work_area", 80),
    rate = text("rate_range", 100);
  if (
    [portrait, stage, area, rate].some((v) => v === null) ||
    (portrait && !isSafeHttpsUrl(portrait))
  )
    return null;
  if (
    !Array.isArray(p.book) ||
    p.book.length > 6 ||
    !Array.isArray(p.credits) ||
    p.credits.length > 12
  )
    return null;
  const book: ProfilePresentation["book"] = [];
  for (const item of p.book) {
    if (
      !item ||
      typeof item.url !== "string" ||
      item.url.length > 500 ||
      !isSafeHttpsUrl(item.url) ||
      typeof item.caption !== "string" ||
      item.caption.length > 120
    )
      return null;
    book.push({ url: item.url.trim(), caption: item.caption.trim() });
  }
  const credits: ProfileCredit[] = [];
  for (const item of p.credits) {
    if (
      !item ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 100 ||
      typeof item.role !== "string" ||
      !item.role.trim() ||
      item.role.length > 80 ||
      typeof item.year !== "string" ||
      !/^(|19\d{2}|20\d{2})$/.test(item.year)
    )
      return null;
    credits.push({
      title: item.title.trim(),
      role: item.role.trim(),
      year: item.year,
    });
  }
  return {
    portrait_url: portrait!,
    stage_name: stage!,
    work_area: area!,
    rate_range: rate!,
    book,
    credits,
  };
}
export function isTalent(disciplines: readonly string[]) {
  return disciplines.some((d) => d === "Actuación" || d === "Modelaje");
}
export function reelSource(value: string) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const host = url.hostname.toLowerCase();
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)
          ? url.pathname === "/watch"
            ? url.searchParams.get("v")
            : url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]
          : null;
    if (id && /^[\w-]{11}$/.test(id))
      return {
        embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        provider: "YouTube",
      };
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const match = url.pathname.match(
        /^\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/,
      );
      if (match) {
        const hash = match[2] || url.searchParams.get("h");
        return {
          embed: `https://player.vimeo.com/video/${match[1]}${hash && /^[a-zA-Z0-9]+$/.test(hash) ? "?h=" + hash : ""}`,
          thumbnail: null,
          provider: "Vimeo",
        };
      }
    }
  } catch {}
  return null;
}
export function portfolioWebUrl(value: string) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function leadReel(items: PortfolioItem[]) {
  return items.find(
    (item) => item.kind === "reel" && portfolioWebUrl(item.url),
  );
}
export function profileCompletion(
  profile: Pick<
    ProfessionalProfile,
    | "disciplines"
    | "city"
    | "availability"
    | "bio"
    | "portfolio_items"
    | "skills"
  > & { presentation?: ProfilePresentation },
) {
  const p = profile.presentation ?? EMPTY_PRESENTATION;
  const checks = [
    {
      label: "Disciplinas",
      done: profile.disciplines.length > 0,
      href: "#identity",
    },
    { label: "Ciudad", done: Boolean(profile.city?.trim()), href: "#identity" },
    {
      label: "Disponibilidad",
      done: profile.availability !== "not_specified",
      href: "#identity",
    },
    {
      label: "Presentación",
      done: Boolean(profile.bio?.trim()),
      href: "#identity",
    },
    {
      label: "Retrato",
      done: isSafeHttpsUrl(p.portrait_url),
      href: "#material",
    },
    {
      label: "Reel o trabajo",
      done: profile.portfolio_items.some((i) =>
        Boolean(i.title.trim() && portfolioWebUrl(i.url)),
      ),
      href: "#material",
    },
    {
      label: "Experiencia",
      done: p.credits.some((c) =>
        Boolean(
          c.title.trim() &&
          c.role.trim() &&
          /^(|19\d{2}|20\d{2})$/.test(c.year),
        ),
      ),
      href: "#experience",
    },
    {
      label: "Habilidades",
      done: profile.skills.length > 0,
      href: "#capabilities",
    },
  ];
  return {
    checks,
    percent: Math.round(
      (checks.filter((c) => c.done).length / checks.length) * 100,
    ),
  };
}

/** The legacy storage key holds the one name explicitly chosen for public use. */
export function professionalName(
  profile: Pick<ProfessionalProfile, "display_name" | "presentation">,
) {
  return profile.presentation.stage_name.trim() || profile.display_name;
}
