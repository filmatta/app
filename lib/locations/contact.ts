export type LocationPublicContact = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
};

export function parseLocationPublicContact(
  formData: FormData,
): { ok: true; value: LocationPublicContact } | { ok: false } {
  const email = optional(formData, "contact_email");
  const phone = optional(formData, "contact_phone");
  const whatsapp = optional(formData, "contact_whatsapp");
  const instagram = optional(formData, "contact_instagram")?.replace(/^@/, "") ?? null;
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
  if (instagram && (instagram.length > 30 || !/^[A-Za-z0-9._]+$/.test(instagram))) {
    return { ok: false };
  }
  if (website && !safeHttpsUrl(website)) return { ok: false };

  return { ok: true, value: { email, phone, whatsapp, instagram, website } };
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
