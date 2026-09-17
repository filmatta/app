# Password recovery callback

FILMATTA accepts both Supabase SSR recovery mechanisms at
`/auth/callback`:

- `code` is exchanged with `exchangeCodeForSession` and keeps the existing
  PKCE flow. The browser that opens the email must have the code-verifier
  cookie created when the recovery request started.
- `token_hash` with `type=recovery` is verified server-side with `verifyOtp`.
  This flow does not depend on the browser that requested the email and is the
  preferred Production recovery link.

The Production reset-password email should use this link after custom SMTP is
configured and the template is editable:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Frestablecer-contrasena%3Fnext%3D%252Fcuenta">
  Restablecer contraseña
</a>
```

Keep `https://app.filmatta.com/auth/callback` in the Auth redirect allow list.
Do not use a wildcard. Invalid, expired, or incomplete recovery callbacks
return to `/recuperar-contrasena?next=/cuenta` without nesting another reset
route or exposing an internal Supabase error.
