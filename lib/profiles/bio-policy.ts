export const BIO_CONTACT_TITLE = "Aquí va tu presentación profesional.";
export const BIO_CONTACT_MESSAGE = "Añade tu usuario de Instagram, WhatsApp y otros datos de contacto en Información personal → Datos de contacto.";
export const BIO_EMAIL_NOTICE = "Tu biografía es pública. Este correo será visible si lo conservas aquí.";
// Keep the same patterns in the additive SQL trigger and the shared fixture matrix.
export const BIO_CONTACT_PATTERNS = [
  "(^|[^a-z0-9._%+-])@[a-z0-9_][a-z0-9._]*",
  "(^|[^a-z0-9_])(ig|instagram)[ ]*[:=][ ]*[@a-z0-9_]",
  "(^|[^a-z0-9_])(mi[ ]+)?ig[ ]+es[ ]+[@a-z0-9_]",
  "(me encuentras|buscame|sigueme|contactame)[ ]+(en[ ]+)?instagram",
  "mi usuario de instagram[ ]+(es|:)",
  "(instagram|contacto|contactarme)[^.]{0,80}mi usuario[ ]+(es|:)",
  "(^|[^a-z0-9_])(www[.])?instagram[.]com/(?!p/|reel/|reels/|stories/|explore/)[a-z0-9_.]+",
  "(^|[^a-z0-9_])(wa[.]me/|api[.]whatsapp[.]com/|chat[.]whatsapp[.]com/|whatsapp://)",
  "(escribeme|contactame|hablame)[ ]+(por|al|en)[ ]+whatsapp",
  "whatsapp[ ]*[:=][ ]*[+0-9(]",
  "(llamame[ ]+al|telefono([ ]+de[ ]+contacto)?[ ]*[:=]|contacto[ ]*[:=])[ ]*[+0-9(][+0-9() .-]{5,}",
  "(^|[^a-z0-9_])arroba[ ]+[a-z0-9_]+",
] as const;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}/gi;
export function analyzeBio(value: string) {
  const normalized = value.slice(0, 1201).normalize("NFKC").toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/[áéíóúüñ]/g, c => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" })[c]!)
    .replace(/\s+/g, " ");
  const hasEmail = new RegExp(EMAIL).test(normalized);
  const masked = normalized.replace(EMAIL, " correo-permitido ");
  return { blocked: BIO_CONTACT_PATTERNS.some(p => new RegExp(p).test(masked)), hasEmail };
}
