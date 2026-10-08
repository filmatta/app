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

  if (tokenHash && !code && (type === "recovery" || type === "email")) {
    if (
      tokenHash.length > 2048 ||
      !(await allowAuthAttempt("callback"))
    ) {
      return type === "recovery" ? recoveryFailureRedirect(request, nextPath) : confirmationFailureRedirect(request, nextPath);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      const destination = type === "recovery" ? recoveryResetPath(nextPath)
        : getRecoveryReturnPath(nextPath) ? "/cuenta" : nextPath;
      return safeRedirect(new URL(destination, request.url));
    }

    console.error("Auth callback verification failed", { type, code: error.code ?? "unknown" });
    return type === "recovery" ? recoveryFailureRedirect(request, nextPath) : confirmationFailureRedirect(request, nextPath);
  }

  if (code && !tokenHash) {
    if (code.length <= 2048 && await allowAuthAttempt("callback")) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return safeRedirect(new URL(nextPath, request.url));
      }

      console.error("Auth callback code exchange failed", { code: error.code ?? "unknown" });
    }

    const recoveryReturnPath = getRecoveryReturnPath(nextPath);
    if (recoveryReturnPath) {
      return recoveryFailureRedirect(request, nextPath);
    }
  }

  return confirmationFailureRedirect(request, nextPath);
}

function confirmationFailureRedirect(request: NextRequest, nextPath: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", nextPath);
  loginUrl.searchParams.set("error", "confirmation_invalid");
  return safeRedirect(loginUrl);
}

function recoveryResetPath(nextPath: string) {
  const returnPath = getRecoveryReturnPath(nextPath) ?? "/cuenta";
  return `/restablecer-contrasena?next=${encodeURIComponent(returnPath)}`;
}

function recoveryFailureRedirect(request: NextRequest, nextPath: string) {
  const recoveryUrl = new URL("/recuperar-contrasena", request.url);
  recoveryUrl.searchParams.set(
    "next",
    getRecoveryReturnPath(nextPath) ?? "/cuenta"
  );
  recoveryUrl.searchParams.set("error", "invalid_recovery");
  return safeRedirect(recoveryUrl);
}

function safeRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
