# Public signup and Auth delivery gate

Scope: the isolated Preview for `codex/public-signup-auth-gate-v1` and Supabase Test
`ezlycwkuzkwcnhrhiruv`. The base is
`c07a99ea79e7ff3028ead1d243886f73906efdf0`. Staging and Production are
outside this gate.

## Existing route and session flow

| Step | Implementation | Destination |
| --- | --- | --- |
| Public signup | `/registro` → `signUp` in `app/auth/actions.ts` → Supabase Auth | Confirmation email, then `/auth/callback?next=...` |
| Login | `/login` → `login` in `app/auth/actions.ts` | Validated internal `next` path, default `/create` |
| Logout | `logout` in `app/cuenta/actions.ts` | `/` after Supabase sign-out |
| Recovery request | `/recuperar-contrasena` → `requestPasswordReset` | Email link to `/auth/callback?next=/restablecer-contrasena...` |
| Confirmation/recovery callback | `app/auth/callback/route.ts` | Server-side OTP verification, session cookie, then Create or reset form |
| New password | `/restablecer-contrasena` → `updateRecoveredPassword` | Account settings or validated internal destination |
| Private Create | `/create` and existing guards | Guest returns to `/login?next=/create` |

The existing Supabase SSR client owns cookies. `proxy.ts` refreshes the session.
No separate client, admin API, or service-role key is used for signup. Existing
analytics are not expanded. Callback query tokens are excluded from FILMATTA's
request-path header; application logs contain only provider error codes/status.

## Supabase Test audit

At the start of this gate, Email sign-in, public signup, and email confirmation
were enabled. Secure email change was enabled. Custom SMTP was **off** and the
integrated email sending limit was **2 messages per hour**. The email template
editor was locked until Custom SMTP was configured. The Test Site URL pointed
at an obsolete feature Preview, and the redirect allowlist contained only older
Preview callbacks. Supabase Test had no usable external SMTP credential. A
Resend secret exists in Vercel **Production** settings, but the automatic
approval review denied extracting Production secrets into a local file; this
gate does not reuse or reveal it.

## Configuration needed to finish live delivery

Use a dedicated, authorized SMTP credential for Supabase Test. The existing
FILMATTA email provider is Resend; its SMTP interface is a suitable choice.
Set Custom SMTP host, port, username, password/API credential, verified sender
email, and sender name `FILMATTA`. Keep confirmation enabled. Then configure
Test Site URL to the current isolated Preview origin and add only its exact
`/auth/callback` URL to the redirect allowlist. Add the staging callback later,
when a staging promotion is approved.

After SMTP unlocks templates, use these links for Test's **Confirm sign up**
and **Reset password** templates respectively. `RedirectTo` carries the exact
callback path and validated internal `next` destination supplied by the app.
The server verifies the token hash, sets the session cookie, and redirects
without leaving the token in the destination URL.

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirmar mi correo</a>
```

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Restablecer contraseña</a>
```

The confirmation subject should say `Confirma tu cuenta de FILMATTA`; the
recovery subject should say `Restablece tu contraseña de FILMATTA`. Avoid link
tracking or token-consuming URL prefetch for these transactional links.

## Verification boundary

Deterministic Auth tests exercise feedback, origin validation, callbacks,
recovery, and redirect safety. The isolated Preview smoke exercises guest Auth
screens at 1280 px and 390 px, private route guarding, sanitized errors, and
invalid callbacks. The real signup, inbox, confirmation, recovery, and first
Project → Writer journey require working Custom SMTP and a controlled QA inbox.
Do not claim the release gate passed before those steps and QA cleanup finish.
