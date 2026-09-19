import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const limits = {
  login: { ip: 60, account: 10, seconds: 900 },
  signup: { ip: 10, account: 3, seconds: 3600 },
  recovery: { ip: 10, account: 3, seconds: 3600 },
  callback: { ip: 60, account: 10, seconds: 900 },
} as const;

export async function allowAuthAttempt(action: keyof typeof limits, account?: string) {
  try {
    const requestHeaders = await headers();
    // Only trust the platform-controlled header when actually hosted on Vercel.
    // Other production hosts share a conservative IP bucket until configured.
    const ip = process.env.VERCEL === "1"
      ? requestHeaders.get("x-vercel-forwarded-for")?.trim()
      : "127.0.0.1";
    if (!ip || !isIP(ip)) return false;
    const secret = process.env.SECURITY_RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return false;
    const config = limits[action];
    const db = createAdminClient();
    const consume = async (kind: "ip" | "account", value: string) => {
      const digest = createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
      const { data, error } = await db.rpc("consume_auth_rate_limit", {
        p_key: `${action}:${kind}:${digest}`, p_limit: config[kind], p_seconds: config.seconds,
      });
      return !error && data === true;
    };
    if (!(await consume("ip", ip))) return false;
    if (account !== undefined) {
      if (account.length > 320) return false;
      return await consume("account", account.trim().toLowerCase());
    }
    return true;
  } catch {
    // No authentication side effect if distributed storage is unavailable.
    return false;
  }
}
