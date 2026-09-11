export function getPublicDisplayName(fullName: string | null) {
  const parts = (fullName ?? "").trim().split(/\s+/u).filter(Boolean);

  if (parts.length === 0) {
    return "Perfil sin nombre";
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const lastInitial = Array.from(parts.at(-1) ?? "")[0]?.toLocaleUpperCase("es-MX");
  return lastInitial ? `${parts[0]} ${lastInitial}.` : parts[0];
}

export function getProfileInitial(displayName: string) {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase("es-MX") ?? "F";
}
