const FILMATTA_ORIGIN = "https://app.filmatta.com";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export function getSafeNextPath(
  value: FormDataEntryValue | string | null,
  fallback = "/cuenta"
) {
  const safeFallback = normalizeInternalPath(fallback) ?? "/cuenta";
  return (
    normalizeInternalPath(typeof value === "string" ? value : "") ?? safeFallback
  );
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
    return getSafeNextPath(fallback, "/cuenta");
  }

  return path;
}

function normalizeInternalPath(value: string) {
  if (CONTROL_CHARACTER_PATTERN.test(value)) return null;

  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    SCHEME_PATTERN.test(candidate)
  ) {
    return null;
  }

  if (!hasSafeDecodedForm(candidate)) return null;

  let resolved: URL;
  try {
    resolved = new URL(candidate, FILMATTA_ORIGIN);
  } catch {
    return null;
  }

  if (resolved.origin !== FILMATTA_ORIGIN) return null;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

function hasSafeDecodedForm(value: string) {
  let decoded = value;

  // Inspect nested encodings as well as the URL parser's final result. This
  // prevents encoded controls or separators from becoming significant later.
  for (let pass = 0; pass < 5; pass += 1) {
    if (
      CONTROL_CHARACTER_PATTERN.test(decoded) ||
      decoded.includes("\\") ||
      decoded.startsWith("//") ||
      SCHEME_PATTERN.test(decoded)
    ) {
      return false;
    }

    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }

    if (next === decoded) return true;
    decoded = next;
  }

  return false;
}

export function getRecoveryReturnPath(value: string) {
  const path = normalizeInternalPath(value);

  if (!path) {
    return null;
  }

  const url = new URL(path, FILMATTA_ORIGIN);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname !== "/restablecer-contrasena") {
    return null;
  }

  return getSafeNextPath(url.searchParams.get("next"), "/cuenta");
}
