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
  const rawPathname = path.split(/[?#]/, 1)[0];
  const pathname = rawPathname.replace(/\/+$/, "") || "/";

  if (
    pathname === "/acceso" ||
    pathname === "/login" ||
    pathname === "/registro"
  ) {
    return fallback;
  }

  return path;
}

export function getRecoveryReturnPath(value: string) {
  const url = new URL(value, "https://filmatta.invalid");

  if (url.origin !== "https://filmatta.invalid") {
    return null;
  }

  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname !== "/restablecer-contrasena") {
    return null;
  }

  return getSafeNextPath(url.searchParams.get("next"), "/cuenta");
}
