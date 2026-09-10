export function getSafeNextPath(
  value: FormDataEntryValue | string | null,
  fallback = "/cuenta"
) {
  const path = typeof value === "string" ? value.trim() : "";

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\r\n]/.test(path)
  ) {
    return fallback;
  }

  return path;
}

export function getSafePostAuthPath(
  value: FormDataEntryValue | string | null,
  fallback = "/cuenta"
) {
  const path = getSafeNextPath(value, fallback);
  const pathname = path.split(/[?#]/, 1)[0];

  if (pathname === "/login" || pathname === "/registro") {
    return fallback;
  }

  return path;
}
