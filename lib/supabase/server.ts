import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  applyAuthCookiePolicy,
  getServerAuthCookiePolicy,
} from "@/lib/supabase/auth-cookie-policy";

export async function createClient() {
  const cookieStore = await cookies();
  const cookiePolicy = getServerAuthCookiePolicy();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: cookiePolicy,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                applyAuthCookiePolicy(options, cookiePolicy),
              )
            );
          } catch {
            // En algunos Server Components no se pueden escribir cookies.
          }
        },
      },
    }
  );
}
