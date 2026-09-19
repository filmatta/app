# Security V1 — Validación final

> Registro histórico de la rama auditada original. La reconciliación vigente con
> `origin/main` está en `sv1-final-reconciliation.md` y el orden operativo de
> release en `sv1-production-release-runbook.md`.

Fecha: 18 de septiembre de 2026 (México). Alcance: SV1-01..04, sin repetir la
auditoría completa. Implementación lista para revisión final; no autoriza merge
ni lanzamiento de Beta.

## Base y aislamiento

- Rama: `audit/security-v1`.
- Worktree: `G:\PROYECTOS\filmatta-security-audit`.
- HEAD inicial auditado, limpio: `ba4d87e9f442e821e1bcfc36f9918a60ae881af3`.
- `origin/main` tras fetch: `f8cbe278656e0f35647ee6f71c4794add87f4cab`.
- Merge-base: `ba4d87e9f442e821e1bcfc36f9918a60ae881af3`.
- Se conservó la base auditada: main avanzó cinco commits con navegación,
  herramientas, documentación, separación Mux y cupón Live smoke. No se integró
  ese conjunto ni ramas experimentales. Para revisar los cambios propios, usar
  `git diff origin/main...HEAD`; el diff de dos extremos también incluye los
  cambios posteriores de main que esta rama todavía no contiene.
- Cuatro commits con los nombres `security/sv1-01-safe-redirects`,
  `security/sv1-02-admin-mfa`, `security/sv1-03-abuse-controls` y
  `security/sv1-04-web-edge`.

## Resultado por paquete

| Hallazgo | Implementación y evidencia |
| --- | --- |
| M-01 | Helper común: control characters/backslash/esquemas, decodificación acotada y parseo con igualdad exacta de origin. Regresión raw/encoded/double-encoded y destinos anidados. HTTPS: tres destinos válidos y doce maliciosos. |
| H-01 | `requireAdmin()` exige rol admin y AAL2 real. Pantalla TOTP de enrollment/challenge y retorno interno. `private.is_admin()` exige también JWT AAL2 en RLS/Storage. Matriz de cuatro combinaciones ejecutada con JWT reales en Test. Cambiar password mantuvo AAL1. |
| M-02 | Presupuestos Auth persistentes y atómicos por IP/cuenta; identidades HMAC; fallo cerrado. Publicación: 50 creaciones y 20 publicaciones por usuario/recurso/24 h, configurables en tabla privada. Triggers cubren RPC y PostgREST. Jobs comparte Opportunities. Se conserva inbox compartido de 10 consultas/24 h y unicidad. |
| M-03 | CSP y cabeceras explícitas en Next; HSTS verificado en Vercel; cookies Secure en SSR/browser/refresh/logout. |
| M-04 | Mux: límite de 1 MiB por bytes, Content-Length temprano, timeout 10 s, firma ausente rechazada sin leer. Firma SDK, cuerpos alterados, streams y retries cubiertos. |

Billing/Stripe: ningún cambio en `lib/billing`, APIs Billing/Stripe ni sus tests.
Sólo la página administrativa de planes conserva su destino al pedir MFA; las
acciones existentes siguen usando el guard común. No se llamó a Stripe.

## Migraciones

- `20260918010000_admin_mfa.sql`.
- `20260918020000_abuse_controls.sql`.

Ambas se validaron en PostgreSQL aislado (PGlite) y se aplicaron explícitamente a
Supabase Test `ezlycwkuzkwcnhrhiruv`. Ninguna se aplicó a Production. Pruebas reales:
escritura de cursos y portadas según rol/AAL, cuotas concurrentes, cambio de
password sin elevar AAL, publicación hasta 20, exceso denegado por RPC y acceso
directo, reintentos sin doble consumo y aislamiento de cuota A/B. Usuarios,
portadas y cursos QA eliminados al terminar.

## Preview HTTPS

- Deployment: `dpl_2iNs9JVSo7CfuTnVLz8q2PHg7PBC`, estado **Ready**.
- URL: https://app-qzt1q0ch2-filmatta.vercel.app
- Supabase Test confirmado por variables públicas Preview existentes y login real.
- Se reutilizaron variables ya configuradas en Vercel; `.vercelignore` excluye
  todos los `.env*`. No se enviaron credenciales locales. Billing se desactivó
  únicamente en este deployment y sus credenciales Stripe/Mux se vaciaron por
  override; no se cambiaron credenciales ni configuración global del proyecto.
- Acceso de prueba limitado al deployment y con TTL, revocado al terminar.
- Código de aplicación desplegado idéntico al entregado. Los cambios posteriores
  al despliegue son tests, evidencia/documentación y configuración de exclusión.

Cabeceras verificadas en `/`, `/login`, `/admin`, `/perfiles`, `/locaciones`,
`/oportunidades`, `/jobs`, `/marketplace`, `/recuperar-contrasena`,
`/restablecer-contrasena` y `/api/mux/webhooks` (GET 405, POST sin firma 400).
HSTS real: `max-age=63072000; includeSubDomains; preload`, emitido por Vercel.

Navegador real: login/next, usuario normal rechazado del admin, refresh con rotación
del refresh token, logout, recuperación con respuesta genérica, callback inválido
interno, admin AAL1 bloqueado, enrollment TOTP real, regreso a `/admin/cursos`,
logout/login y challenge TOTP existente con acceso a `/admin`. Sin infracciones
CSP observadas en la pantalla administrativa comprobada. No se probaron uploads
Mux/playback ni Checkout reales en este Preview sin credenciales.

## Cookies observadas (sin valores)

Prefijo: `sb-ezlycwkuzkwcnhrhiruv-auth-token`.

| Cookie | Emisión observada | Atributos |
| --- | --- | --- |
| Prefijo sin sufijo | Login y refresh | Path=/; host-only; SameSite=Lax; Secure; HttpOnly ausente; Max-Age=34560000; Expires a 400 días |
| `.0`, `.1` | Login de administrador con factor registrado | Mismos atributos/lifetime; fragmentación administrada por Supabase |
| `-code-verifier` | Solicitud recovery | Path=/; host-only; SameSite=Lax; Secure; HttpOnly ausente; Max-Age=34560000; Expires a 400 días |
| `-flow-<id>-code-verifier`, `-flows-code-verifier` | Limpieza de estado de recovery | Path=/; Secure; SameSite=Lax; Max-Age=0 |
| Sesión, fragmentos y verifier | Logout | Path=/; Secure; SameSite=Lax; Max-Age=0 |

Se verificó que la sesión desaparece del cookie jar tras logout. HttpOnly se
mantiene ausente por dependencia del cliente browser de Supabase. El dominio es
el host único del Preview, sin atributo Domain ni extensión a `.vercel.app` o
FILMATTA Production. El cookie jar no enviaría cookies Auth Preview a
`https://app.filmatta.com`; no se realizó esa petición. La separación por proyecto
Supabase y host está comprobada; no se usaron sesiones reales de Production para
afirmar una prueba cruzada en vivo.

Evidencia completa, con atributos y sin valores: `sv1-preview-evidence.json`.

## Regresión

- **121/121** tests locales, incluidos Auth, security, navigation, catalogs,
  PostgreSQL/RLS/Storage, tools y **Billing 54/54**.
- Test remoto de MFA/RLS/Storage/cuotas: **PASS**.
- E2E HTTPS de seguridad: **PASS**.
- TypeScript: PASS.
- Lint: 0 errores, 8 warnings existentes `no-img-element`.
- Production build: PASS (compilación local y build Preview; no deploy Production).
- `git diff --check`: PASS.

Reproducción local: `npm run test:auth`, `npm run test:security`,
`npm run test:billing`, `npm run test:navigation`, `npm run test:catalogs`,
`npm run test:database`, `npm run test:tools`, `npm run lint`, `npm run build`,
`npx tsc --noEmit`, `git diff --check`.

Remoto: configurar `FILMATTA_RUN_REMOTE_TESTS=ezlycwkuzkwcnhrhiruv` y
`FILMATTA_TEST_ENV_FILE` a un archivo Test existente; ejecutar
`node --test tests/integration/security-blockers.test.mjs`. Para navegador,
configurar además `FILMATTA_PREVIEW_URL` y `FILMATTA_PREVIEW_SHARE_FILE` con la
respuesta del enlace temporal del deployment; ejecutar
`node tests/remote/security-preview.mjs` y revocar después ese enlace. El script
limpia usuarios QA y guarda sólo resultados/atributos. `FILMATTA_CHROME_PATH`
permite seleccionar el Chrome instalado.

## Pendientes de la revisión final / Beta

No se reprodujeron blockers adicionales de código en el alcance probado. Aún no
se declara Beta autorizada:

1. Integrar los cuatro paquetes con main actual en una revisión posterior y
   repetir regresión, preservando la separación Mux que avanzó en main. Esta rama
   deliberadamente conserva la base auditada; no sustituir main por su snapshot.
2. Aplicar las dos migraciones en el release autorizado antes del código y
   establecer enrollment TOTP/recovery operativo de los administradores. No hay
   bypass de emergencia por password en esta implementación.
3. Verificar configuración efectiva de rate limits/CAPTCHA de Supabase y WAF/bots
   de la plataforma antes de abrir Beta. Los límites de Next no se atribuyen a los
   endpoints Auth directos del proveedor; esa defensa queda delegada a Supabase.
4. Callback positivo mediante email/PKCE, SMTP y recuperación completa siguen
   pendientes. Se comprobó callback inválido y páginas/solicitud recovery, no
   entrega de correo ni allowlist del nuevo Preview. No se integró recovery-callback.
5. Verificar reproducción/upload Mux y los redirects de Checkout/Portal en un
   candidato con sus credenciales Test autorizadas. Este Preview excluyó esas
   operaciones; las firmas Mux se verificaron con secretos sintéticos locales.

Hardening posterior: nonces CSP (con evaluación de render/caché), estrechar orígenes
de imágenes si el producto restringe proveedores y mejorar recuperación operativa
de factores. `unsafe-inline` temporal y su motivo están documentados en SV1-04.

La revisión automática bloqueó el primer intento de transmitir una clave local y
la descarga completa de variables. Se completó el despliegue mediante la alternativa
permitida: variables Preview existentes, verificación sólo de parámetros públicos
y exclusión de archivos de entorno. No quedó una aprobación pendiente.
