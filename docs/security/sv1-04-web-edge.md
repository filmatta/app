# SV1-04 — Web, cookies and Mux

Next emits CSP, frame-ancestors none, X-Frame-Options DENY, nosniff,
strict-origin-when-cross-origin and a Permissions-Policy disabling unused camera,
microphone, geolocation and payment APIs. Hosted Checkout/Portal top-level
redirects remain permitted; no Stripe code is modified. HSTS is left to Vercel to
avoid duplicate/incompatible policies and must be verified over HTTPS.

CSP uses the configured Supabase origin and its WebSocket counterpart; Mux media,
telemetry and upload sources follow [Mux guidance](https://www.mux.com/docs/core/content-security-policy).
Current user-hosted HTTPS images remain supported. Mux, YouTube and Vimeo frames
are allowed, while this app cannot be framed. The Vercel toolbar's additional
sources are allowed only in Preview, following its
[documented CSP requirements](https://vercel.com/docs/vercel-toolbar/managing-toolbar).

Production builds disallow unsafe-eval. Inline scripts remain temporarily allowed
for Next prerendered hydration, and inline styles for the current UI/player. Inline
event handlers are disabled separately with script-src-attr none. Moving to nonces
requires dynamic rendering and a separate performance/caching decision; this
policy is defense in depth, not a complete XSS mitigation.

The shared Auth cookie policy adds Secure for HTTPS browsers/Vercel/production
servers, including refresh and deletion. It preserves Supabase Path, SameSite,
host-only scope, lifetime and fragment behavior. HttpOnly remains false because
Supabase's browser client reads and rotates this session. Local HTTP development
continues without Secure in the browser. Real HTTPS attributes are recorded in
the validation report, without tokens or cookie values.

Mux webhook: reject absent signature before reading; reject invalid/oversized
Content-Length; cap streamed bytes at 1 MiB even with missing/false length; stop
slow body reads after ten seconds. The original UTF-8 text is passed to Mux's
signature verifier. Too large => 413, malformed => 400, timeout => 408. Valid
events retain the existing canonical synchronization/retry behavior. No Mux
credentials or Stripe webhook code changed. Tests include valid SDK signatures,
tampering, repeated signed events and streamed limit violations.

No WAF/bot/dashboard changes are implied by these headers. The shared database
Auth budget supplements the provider's direct Auth limits. Platform logging and
edge protections require an operational release review; this task changes code
and an isolated Test/Preview only.
