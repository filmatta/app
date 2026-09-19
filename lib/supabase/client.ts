import { createBrowserClient } from "@supabase/ssr";
import { getBrowserAuthCookiePolicy } from "@/lib/supabase/auth-cookie-policy";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: getBrowserAuthCookiePolicy(),
    },
  );
}
