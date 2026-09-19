# SV1-02 — Admin MFA

The existing role in `profiles` remains authoritative. `requireAdmin()` verifies
the authenticated claims and role, then uses Supabase's official
`getAuthenticatorAssuranceLevel()` to require current AAL2 and an enrolled factor.
Password-only sessions redirect to `/verificar-admin`, with an internal return
path. The identity-only helper is restricted to that enrollment/challenge screen.

The screen supports enrollment and verification with TOTP and existing verified
factors. QR/secret exist only in the enrollment response/UI, never logs. Navigation
after success causes a new server authorization check. Interrupted mutations are
not replayed automatically; the administrator retries after verification. Password
recovery/password changes grant no exemption. Lost authenticators require a
separate operator recovery procedure, not an application bypass.

The additive migration replaces `private.is_admin()` with role AND JWT AAL2.
Existing course, module, lesson, profile and Storage administrator policies reuse
it. Public published and owner reads are preserved. Existing server actions
(including plan grants and video operations) check `requireAdmin()` before any
privileged work. The lesson administrator preview also checks it before applying
the existing admin access exception. Billing access logic is unchanged.

Tests execute the role/AAL matrix against the real guard, denial before grant
mutations, and actual course/Storage policies in isolated PostgreSQL. Apply the
migration before making the new admin UI available. Test deployment evidence and
remaining release prerequisites are recorded in the final validation report.

Reference: [Supabase assurance level API](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel).
