import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
export type PrivateContact = { instagram_username: string; whatsapp_e164: string; preferred_contact: "none" | "instagram" | "whatsapp"; contact_visibility: "private" };
export const EMPTY_CONTACT: PrivateContact = { instagram_username: "", whatsapp_e164: "", preferred_contact: "none", contact_visibility: "private" };
export function normalizeInstagram(input: string): string | null {
  let value = input.trim();
  if (!value) return "";
  if (value.length > 200) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(u.hostname) || u.username || u.password || u.port || u.search || u.hash) return null;
      const match = u.pathname.match(/^\/([a-zA-Z0-9._]+)\/?$/); if (!match) return null;
      value = match[1];
    } catch { return null; }
  } else value = value.replace(/^@/, "");
  value = value.toLowerCase();
  return /^[a-z0-9_][a-z0-9._]{0,29}$/.test(value) && !value.endsWith(".") && !value.includes("..") && !["p", "reel", "reels", "stories", "explore", "accounts", "direct"].includes(value) ? value : null;
}
export function normalizeWhatsApp(input: string, country?: CountryCode) {
  if (!input.trim()) return { canonical: "", display: "" };
  if (input.length > 60 || !/^[+0-9() .-]+$/.test(input.trim()) || (!input.trim().startsWith("+") && !country)) return null;
  const phone = parsePhoneNumberFromString(input.trim(), country);
  if (!phone || phone.ext || !phone.isPossible()) return null;
  return { canonical: String(phone.number), display: phone.formatInternational() };
}
export function parsePrivateContact(value: unknown): PrivateContact | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.contact_visibility !== "private" || typeof v.instagram_username !== "string" || typeof v.whatsapp_e164 !== "string" || !["none", "instagram", "whatsapp"].includes(String(v.preferred_contact))) return null;
  const instagram = normalizeInstagram(v.instagram_username), whatsapp = normalizeWhatsApp(v.whatsapp_e164);
  if (instagram === null || whatsapp === null || whatsapp.canonical !== v.whatsapp_e164) return null;
  const preferred = (v.preferred_contact === "instagram" && !instagram) || (v.preferred_contact === "whatsapp" && !whatsapp.canonical) ? "none" : v.preferred_contact as PrivateContact["preferred_contact"];
  return { instagram_username: instagram, whatsapp_e164: whatsapp.canonical, preferred_contact: preferred, contact_visibility: "private" };
}
