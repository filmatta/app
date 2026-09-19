# Security V1 — revisión final y reconciliación con main

Fecha: 18 de septiembre de 2026. Esta revisión parte de `origin/main` en
`f8cbe278656e0f35647ee6f71c4794add87f4cab` y deja el candidato en la rama
`integration/security-v1-current-main`. No se modificó `main`, no hubo deploy de
Production y no se aplicó SQL en Production.

## Estado Git comprobado

- Security original: `audit/security-v1` en `55af93289c4749173a5604611b5c5ab880d25adb`.
- Base común original: `ba4d87e9f442e821e1bcfc36f9918a60ae881af3`.
- Commits exclusivos de Security: `2a2e30c`, `3d05f6f`, `ee2d863`, `55af932`.
- Main desde la base: Tools (`5cd8a1d`), cierre Navigation/Catalog
  (`091ad41`), Live smoke discount (`ca9daab`), separación de entorno Mux
  (`7370c8d`) y restauración del dropdown de cuenta (`f8cbe27`).
- El experimento `codex/recovery-callback` no está en main y no se integró.

Los cuatro commits se reaplicaron como cuatro commits equivalentes, manteniendo
el estado nuevo de main. El único conflicto textual fue `package.json`; el webhook
Mux se combinó automáticamente y después se verificó de forma dirigida.

## Matriz de reconciliación

| Archivo / área | Security | Main después de la base | Conflicto lógico | Resolución |
| --- | --- | --- | --- | --- |
| `lib/auth/*`, `app/auth/*`, `app/cuenta/*` | Redirect seguro y rate limits | Sin cambios | No | Se conserva Security sin traer recovery experimental. |
| `require-admin`, páginas/actions admin | AAL2 y UX TOTP | Sin cambios | No | Se conserva el sistema existente de roles y se añade AAL2 antes de trabajo privilegiado. |
| RLS, `private.is_admin`, Storage | Requiere JWT AAL2 | Sin cambios | No | Migración aditiva; las policies existentes heredan el gate. |
| Auth rate limits y quotas | Nuevos RPC, tablas y triggers | Sin cambios | No | Se mantienen los límites originales de Security. |
| `next.config.ts`, Supabase SSR/cookies, `proxy.ts` | Headers y Secure | Sin cambios | No | Se conserva la política común y los defaults de Supabase. |
| `app/api/mux/webhooks/route.ts` | Firma temprana y cuerpo acotado | Guard de environment y `whoami` | Sí | Orden final: tamaño/firma, parseo firmado, environment del evento, `whoami`, sync/retries. Límite 1 MiB intacto. |
| `lib/mux/*` y video actions | Sólo compatibilidad CSP | Main añadió separación dev/production | Sí, por interacción | Se preservan íntegros los helpers de main y se prueban junto al webhook endurecido. |
| `package.json` | Scripts Auth/Security | Script Mux | Textual | Se conservaron los tres scripts. |
| tests | Suites Security nuevas | Suites Mux/Billing/Navigation/Tools nuevas | Sí, en loader del webhook | Se adaptó sólo el fixture Mux al nuevo lector y header de firma; ambos contratos quedan cubiertos. |
| Billing/Stripe | Guard MFA en la página/actions admin ya existentes | Live smoke discount y Billing 55 tests | No | Main se preserva. No se modificó lógica Billing/Stripe. |
| Navigation/Catalog/Tools | Sin cambios de producto | Cambios legítimos de main | No | Se preservan íntegros y se validan en el Preview final. |

## Migraciones y Production read-only

Release SQL exacto:

1. `supabase/migrations/20260918020000_abuse_controls.sql` — no depende de MFA;
   crea el contador Auth, configuración/ledger de publicación y cuatro triggers.
2. `supabase/migrations/20260918010000_admin_mfa.sql` — reemplaza únicamente
   `private.is_admin()` para exigir rol admin y `aal2`.

Los nombres mantienen la numeración de Security original aunque el runbook aplica
abuse antes de MFA por seguridad operativa. Production no expone una tabla
`supabase_migrations.schema_migrations`, por lo que el release debe registrar la
ejecución fuera de la base y verificar los objetos explícitamente.

La consulta read-only a Production `ihryubbegljbwmuyazbn` confirmó:

- las cinco tablas/columnas requeridas ya existen;
- `private.is_admin()` aún comprueba sólo `profiles.role`;
- no existen `auth_rate_buckets`, `publication_limits`, `publication_events` ni
  triggers `security_publication_quota`;
- 17 policies de datos/Storage dependen de `private.is_admin()`;
- existe un admin y actualmente tiene cero factores MFA verificados;
- Locations, Opportunities, Projects y Services tienen cero filas, por lo que no
  existe inventario previo que quede fuera del ledger inicial.

La migración MFA no cambia filas. La migración de abuso no modifica ni rellena
datos de producto: los límites cuentan únicamente inserts/publicaciones futuras.
Los contadores Auth guardan HMAC, no IP/correo en claro. El ledger se limpia a los
siete días y borrar una publicación no devuelve cuota.

## Estado de los controles

- MFA: user AAL1/AAL2 denegado; admin AAL1 denegado; admin AAL2 permitido. Cambio
  de password conserva AAL1. Acciones admin y video llaman `requireAdmin()` antes
  de acceder a servicios privilegiados. Storage `course-covers` hereda AAL2.
- Abuso: límites Auth atómicos por IP/cuenta, fallo cerrado; quotas por usuario y
  recurso, sin bypass RPC/PostgREST; retries no duplican; Jobs comparte
  Opportunities; inbox Jobs/Services conserva 10 consultas/24 h y unicidad.
- Web: CSP compatible con Supabase, Mux, Stripe redirects, Vercel Preview e imágenes
  HTTPS actuales; `frame-ancestors 'none'`, DENY, nosniff, Referrer-Policy y
  Permissions-Policy. `unsafe-eval` ausente en producción; inline temporal queda
  documentado por hidratación Next. HSTS real de Vercel confirmado.
- Cookies: Secure, SameSite=Lax, Path `/`, host-only y lifetime Supabase; HttpOnly
  permanece ausente porque el cliente browser rota la sesión. Refresh rota tokens
  y logout elimina sesión/fragmentos.
- Mux: firma original, retries/sync, guard de environment, `whoami`, límite 1 MiB,
  timeout y lectura por bytes conviven en el candidato.

## Validación final

- Regresión local: **137/137**.
- Billing actual: **55/55**.
- Mux + Security dirigidos: **32/32**.
- Supabase Test remoto MFA/RLS/Storage/quotas: PASS; datos QA eliminados.
- TypeScript: PASS.
- Lint: 0 errores, 8 warnings `no-img-element` preexistentes.
- Production build: PASS.
- `git diff --check`: PASS.

Preview final: https://app-jjcny9i60-filmatta.vercel.app — deployment
`dpl_DatnwYsPAG1NAhUMW3rXnn6fY7Z3`, estado Ready. Se comprobó login, redirects,
cookies, refresh/logout, recovery request, callback inválido seguro, admin AAL1,
enrollment y challenge AAL2, navegación, catálogos, Tools, planes, headers/HSTS y
webhook Mux inválido/sobredimensionado. El acceso temporal fue revocado y los
usuarios QA eliminados. Evidencia sin tokens en `sv1-preview-evidence.json`.

No se ejecutó un pago, webhook Mux válido real ni recovery por SMTP. Esos controles
se cubren por suites locales/guard de entorno o quedan como smoke operativo del
release, sin ampliar este cambio a Production.
