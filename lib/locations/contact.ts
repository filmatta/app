export type LocationPublicContact = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  isPublic: boolean;
};

export function parseLocationPublicContact(
  formData: FormData,
): { ok: true; value: LocationPublicContact } | { ok: false } {
  const email = optional(formData, "contact_email");
  const phone = optional(formData, "contact_phone");
  const whatsapp = optional(formData, "contact_whatsapp");
  const website = optional(formData, "contact_website");

  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { ok: false };
  }
  if (phone && (phone.length > 40 || !/^\+?[0-9 ()-]{7,40}$/.test(phone))) {
    return { ok: false };
  }
  if (whatsapp && (whatsapp.length > 20 || !/^\+?[1-9][0-9]{6,19}$/.test(whatsapp))) {
    return { ok: false };
  }
  if (website && !safeHttpsUrl(website)) return { ok: false };

  const hasChannel = Boolean(email || phone || whatsapp || website);
  const isPublic = formData.get("contact_is_public") === "yes" && hasChannel;
  return { ok: true, value: { email, phone, whatsapp, website, isPublic } };
}

function optional(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

function safeHttpsUrl(value: string) {
  if (value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}
