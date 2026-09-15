# FILMATTA Billing Live: configuración de Production

Production usa Stripe Live y un proyecto Supabase Production separado. No se
debe reutilizar ningún proyecto, webhook u objeto de Stripe Test. Mantener
`BILLING_ENABLED=false` hasta aplicar y revisar manualmente el orden completo
de `supabase/production/BOOTSTRAP_ORDER.md`, configurar todas las variables y
verificar el webhook Live. Un proyecto vacío debe crear primero la foundation
de Profiles/Courses y el schema Learn; `billing_live_foundation.sql` no es el
primer script del bootstrap.

| Variable | Tipo | Obligatoria | Validación en Production |
| --- | --- | --- | --- |
| `BILLING_ENABLED` | Config | Sí | `true` sólo durante la activación controlada |
| `BILLING_MODE` | Config | Sí | Exactamente `live` |
| `BILLING_APP_URL` | Config | Sí | Exactamente `https://app.filmatta.com` |
| `BILLING_MX_CHECKOUT_VERIFIED` | Config | Sí | Exactamente `true` antes de habilitar Checkout |
| `BILLING_LIVE_SUPABASE_PROJECT_REF` | Config | Sí | Debe coincidir con el hostname de `NEXT_PUBLIC_SUPABASE_URL` |
| `STRIPE_LIVE_ACCOUNT_ID` | Config | Sí | Cuenta Live esperada; el API debe devolver esa cuenta MX |
| `STRIPE_PLUS_PRICE_ID` | Config | Sí | Price Live activo, mensual, MXN, 29900 y producto activo |
| `STRIPE_PRO_PRICE_ID` | Config | Sí | Price Live activo, mensual, MXN, 49900 y producto activo |
| `STRIPE_MX_TAX_RATE_ID` | Config | Sí | Tax Rate Live activa, inclusiva, MX, 16% |
| `STRIPE_ADMIN_PORTAL_CONFIGURATION_ID` | Config | Sí para Portal | Configuration Live activa, sin cambios de Price |
| `STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID` | Config | Sí para upgrade | Configuration Live activa con sólo Plus y Pro |
| `STRIPE_SECRET_KEY` | Secret | Sí | Debe comenzar con `sk_live_`; sólo servidor |
| `STRIPE_WEBHOOK_SECRET` | Secret | Sí | Debe comenzar con `whsec_`; sólo servidor |
| `NEXT_PUBLIC_SUPABASE_URL` | Config pública | Sí | URL del proyecto Supabase Production separado |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config pública | Sí | Publishable key del mismo proyecto Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Sí | Service role del mismo proyecto; sólo servidor |

`VERCEL_ENV` lo proporciona Vercel y debe ser `production`. El código rechaza
Billing Live fuera de ese entorno y rechaza Billing Test dentro de él.

Objetos Live aprobados para la activación:

- Cuenta: `acct_1UEgE119Q9sTgWk6`
- Plus: `price_1UEiU419Q9sTgWk6GWFCmNTL`
- Pro: `price_1UEiUi19Q9sTgWk6tnmhFNYe`
- IVA MX: `txr_1UFpcy19Q9sTgWk6VzeYioYT`
- Portal de upgrade: `bpc_1UFqf619Q9sTgWk6H798UlOD`
- Webhook: `https://app.filmatta.com/api/stripe/webhooks`

El ID del Portal Admin Live se completa al configurar Production. Nunca guardar
claves secretas ni el service role en archivos versionados.
