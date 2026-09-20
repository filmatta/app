import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileContactEmailHtml } from "./email-template";

type NotificationResult = "delivered" | "skipped" | "failed";

export async function notifyNewProfileContact(inquiryId: string, senderId: string): Promise<NotificationResult> {
  if (process.env.CONTACT_EMAIL_NOTIFICATIONS_ENABLED !== "true") {
    console.warn("[contacts/email] notifications disabled");
    return "skipped";
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_EMAIL_FROM;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.filmatta.com";
  if (!apiKey || !from) {
    console.error("[contacts/email] server configuration missing");
    return "skipped";
  }
  try {
    const admin = createAdminClient();
    const { data: inquiry, error } = await admin.from("catalog_inquiries")
      .select("recipient_id,sender_id,sender_display_name,source_type")
      .eq("id", inquiryId).eq("sender_id", senderId).not("profile_id", "is", null).maybeSingle();
    if (error || !inquiry) {
      console.error("[contacts/email] inquiry lookup failed");
      return "failed";
    }
    const { data: recipient, error: recipientError } = await admin.auth.admin.getUserById(inquiry.recipient_id);
    if (recipientError || !recipient.user.email) {
      console.error("[contacts/email] recipient lookup failed");
      return "failed";
    }
    const to = process.env.VERCEL_ENV === "production"
      ? recipient.user.email
      : process.env.CONTACT_EMAIL_TEST_RECIPIENT;
    if (!to) {
      console.error("[contacts/email] delivery recipient missing");
      return "skipped";
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from, to: [to], subject: "Recibiste una nueva consulta en FILMATTA",
        html: profileContactEmailHtml({
          sender: inquiry.sender_display_name ?? "Un miembro de FILMATTA",
          context: inquiry.source_type === "talent" ? "tu perfil de talento" : "tu perfil profesional",
          href: `${siteUrl.replace(/\/$/, "")}/cuenta/contactos/${inquiryId}`,
        }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[contacts/email] provider rejected request (${response.status})`);
      return "failed";
    }
    return "delivered";
  } catch (error) {
    const kind = error instanceof Error ? error.name : "unknown";
    console.error(`[contacts/email] delivery failed (${kind})`);
    return "failed";
  }
}
