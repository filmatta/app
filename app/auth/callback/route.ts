import { NextRequest, NextResponse } from "next/server";
import {
  getRecoveryReturnPath,
  getSafePostAuthPath,
} from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";
import { allowAuthAttempt } from "@/lib/security/auth-rate-limit";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const nextPath = getSafePostAuthPath(
    request.nextUrl.searchParams.get("next"),
    "/cuenta"
  );

  if (tokenHash && type === "recovery") {
    if (
      tokenHash.length > 2048 ||
      !(await allowAuthAttempt("callback"))
    ) {
      return recoveryFailureRedirect(request, nextPath);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    console.error("Error verificando el token de recuperación:", error);
    return recoveryFailureRedirect(request, nextPath);
  }

  if (code) {
    if (code.length <= 2048 && await allowAuthAttempt("callback")) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL(nextPath, request.url));
      }

      console.error("Error confirmando la sesión de Supabase:", error);
    }

    const recoveryReturnPath = getRecoveryReturnPath(nextPath);
    if (recoveryReturnPath) {
      return recoveryFailureRedirect(request, nextPath);
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", nextPath);
  loginUrl.searchParams.set(
    "error",
    "No pudimos confirmar la cuenta. Solicita un enlace nuevo."
  );
  return NextResponse.redirect(loginUrl);
}

function recoveryFailureRedirect(request: NextRequest, nextPath: string) {
  const recoveryUrl = new URL("/recuperar-contrasena", request.url);
  recoveryUrl.searchParams.set(
    "next",
    getRecoveryReturnPath(nextPath) ?? "/cuenta"
  );
  recoveryUrl.searchParams.set("error", "invalid_recovery");
  return NextResponse.redirect(recoveryUrl);
}
