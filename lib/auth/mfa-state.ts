export type MfaFactorSummary = {
  id: string;
  name: string;
  status: "verified" | "unverified";
};

export type MfaSnapshot = {
  available: boolean;
  factors: MfaFactorSummary[];
  currentLevel: string | null;
  nextLevel: string | null;
};

type MfaApiError = {
  code?: string;
  message?: string;
};

type FactorResult = {
  data: {
    all: Array<{
      id: string;
      friendly_name?: string;
      factor_type: string;
      status: string;
    }>;
  } | null;
  error: MfaApiError | null;
};

type AssuranceResult = {
  data: {
    currentLevel: string | null;
    nextLevel: string | null;
  } | null;
  error: MfaApiError | null;
};

export type MfaViewState =
  | "unavailable"
  | "not-configured"
  | "enrolling"
  | "pending"
  | "challenge"
  | "active";

export function buildMfaSnapshot(
  factors: FactorResult,
  assurance: AssuranceResult,
): MfaSnapshot {
  if (factors.error || assurance.error || !factors.data || !assurance.data) {
    return {
      available: false,
      factors: [],
      currentLevel: null,
      nextLevel: null,
    };
  }

  return {
    available: true,
    factors: factors.data.all
      .filter(
        (factor) =>
          factor.factor_type === "totp" &&
          (factor.status === "verified" || factor.status === "unverified"),
      )
      .map((factor) => ({
        id: factor.id,
        name: factor.friendly_name ?? "Aplicación de autenticación",
        status: factor.status as "verified" | "unverified",
      })),
    currentLevel: assurance.data.currentLevel,
    nextLevel: assurance.data.nextLevel,
  };
}

export async function readMfaSnapshot(
  listFactors: () => Promise<FactorResult>,
  getAssurance: () => Promise<AssuranceResult>,
) {
  const [factors, assurance] = await Promise.all([
    listFactors(),
    getAssurance(),
  ]);
  return buildMfaSnapshot(factors, assurance);
}

export function getMfaViewState(
  snapshot: MfaSnapshot,
  enrollmentActive = false,
): MfaViewState {
  if (enrollmentActive) return "enrolling";
  if (!snapshot.available) return "unavailable";

  const hasVerifiedFactor = snapshot.factors.some(
    (factor) => factor.status === "verified",
  );
  if (hasVerifiedFactor) {
    return snapshot.currentLevel === "aal2" ? "active" : "challenge";
  }

  if (snapshot.factors.some((factor) => factor.status === "unverified")) {
    return "pending";
  }

  return "not-configured";
}

export function getMfaFactorSelection(
  snapshot: MfaSnapshot,
  currentFactorId: string,
) {
  if (snapshot.factors.some((factor) => factor.id === currentFactorId)) {
    return currentFactorId;
  }
  return (
    snapshot.factors.find((factor) => factor.status === "verified")?.id ?? ""
  );
}

export function getMfaQrImageSource(qrCode: string) {
  const source = qrCode.trim();
  if (/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(source)) return source;
  if (!source.startsWith("<svg")) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export type MfaVerificationFailure =
  | "invalid-code"
  | "expired-challenge"
  | "verification-failed"
  | "session-not-aal2";

export type MfaVerificationResult =
  | { ok: true; currentLevel: string; nextLevel: string | null }
  | { ok: false; reason: MfaVerificationFailure };

export async function verifyMfaChallenge(
  factorId: string,
  code: string,
  challengeAndVerify: (params: {
    factorId: string;
    code: string;
  }) => Promise<{ error: MfaApiError | null }>,
  getAssurance: () => Promise<AssuranceResult>,
): Promise<MfaVerificationResult> {
  if (!factorId || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: "invalid-code" };
  }

  // Supabase performs challenge() and verify() atomically here and persists
  // the promoted browser session returned by verify().
  const verification = await challengeAndVerify({ factorId, code });
  if (verification.error) {
    return {
      ok: false,
      reason:
        verification.error.code === "mfa_challenge_expired"
          ? "expired-challenge"
          : verification.error.code === "mfa_verification_failed" ||
              verification.error.code === "mfa_verification_rejected"
            ? "invalid-code"
            : "verification-failed",
    };
  }

  const assurance = await getAssurance();
  if (
    assurance.error ||
    !assurance.data ||
    assurance.data.currentLevel !== "aal2"
  ) {
    return { ok: false, reason: "session-not-aal2" };
  }

  return {
    ok: true,
    currentLevel: assurance.data.currentLevel,
    nextLevel: assurance.data.nextLevel,
  };
}

export function getMfaVerificationMessage(reason: MfaVerificationFailure) {
  if (reason === "expired-challenge") {
    return "La verificación expiró. Usa el código actual de tu autenticador e inténtalo de nuevo.";
  }
  if (reason === "invalid-code") {
    return "El código no es válido. Comprueba tu autenticador e inténtalo de nuevo.";
  }
  if (reason === "session-not-aal2") {
    return "El código fue aceptado, pero la sesión no alcanzó el nivel de seguridad requerido. Inicia sesión de nuevo.";
  }
  return "No pudimos verificar tu identidad. Inténtalo de nuevo.";
}
