import { NextRequest, NextResponse } from "next/server";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafePostAuthPath(
    request.nextUrl.searchParams.get("next"),
    "/cuenta"
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    console.error("Error confirmando la sesión de Supabase:", error);
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", nextPath);
  loginUrl.searchParams.set(
    "error",
    "No pudimos confirmar la cuenta. Solicita un enlace nuevo."
  );
  return NextResponse.redirect(loginUrl);
}
