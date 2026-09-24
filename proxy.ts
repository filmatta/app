import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Stripe authenticates this new endpoint with its signature, not a user session.
  if (request.nextUrl.pathname === "/api/stripe/webhooks") return NextResponse.next();
  // Photo completion performs its own owner authentication. Keeping this
  // request out of the session-refresh proxy also prevents an accepted upload
  // from waiting indefinitely before its finalization handler can run.
  if (/^\/api\/locations\/photos\/[^/]+\/complete$/.test(request.nextUrl.pathname))
    return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
