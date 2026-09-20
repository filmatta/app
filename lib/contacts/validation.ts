import { CONTACT_TYPES, type ContactType } from "./types";

export const CONTACT_MESSAGE_MIN = 20;
export const CONTACT_MESSAGE_MAX = 3000;
export const CONTACT_REPORT_MIN = 3;
export const CONTACT_REPORT_MAX = 500;

export function parseContactInput(form: FormData) {
  const slug = String(form.get("slug") ?? "").trim();
  const contactType = String(form.get("contact_type") ?? "");
  const message = String(form.get("message") ?? "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120)
    return { ok: false as const, error: "El perfil ya no está disponible." };
  if (!CONTACT_TYPES.some((item) => item.value === contactType))
    return { ok: false as const, error: "Elige un motivo válido." };
  if (message.length < CONTACT_MESSAGE_MIN || message.length > CONTACT_MESSAGE_MAX)
    return { ok: false as const, error: "Escribe un mensaje de entre 20 y 3 000 caracteres." };
  return { ok: true as const, slug, contactType: contactType as ContactType, message };
}

export function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
