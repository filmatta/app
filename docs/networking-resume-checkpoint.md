# Networking Foundation V1 — reanudación auditada

21 de septiembre de 2026. Sólo Preview / Supabase Test `ezlycwkuzkwcnhrhiruv`. No merge, push a main, cambios de Production, cambios de variables ni envío de emails.

## Checkpoint inicial y sincronización

- Main y origin/main después del fetch: `a2e89353698e1c6ec163f06fddf0a1e9ecf2f985`.
- Feature inicial: `d6a2dcdf2dcc42ff28696b10aa33400f777fb4f7`, rama `feature/profiles-portfolio-polish`.
- Worktree correcto: `G:\PROYECTOS\filmatta-profiles-polish`, inicialmente limpio.
- Merge-base: el mismo `a2e8935`. Divergencia: **0 exclusivos de main / 19 exclusivos de feature**.
- Estado encontrado: implementación Networking completa, con commits locales sin integrar a main; no cambios sin commit, ni implementación perdida en otro worktree.
- Estrategia: conservar historial. Main ya era ancestro; no era necesario rebase, merge ni cherry-pick. No hubo conflictos ni colisiones de prefijos de migraciones.
- Contacto Operativo V1, incluido `f3f5cdc` y `a2e8935`, ya forma parte de la feature. No se reimplementó.

Se auditó el inventario completo de worktrees. Los relevantes:

| Worktree / rama | HEAD al inicio | Estado |
|---|---|---|
| `filmatta-profiles-polish` / feature actual | `d6a2dcd` | CLEAN |
| `filmatta-profile-contact-v1` | `a2e8935` | CLEAN |
| `filmatta-main-deploy-20260915` / main | `a2e8935` | CLEAN |
| `filmatta-profile-public-ui-v2` | `e235099` | CLEAN |
| `filmatta-profile-portfolio-editor` | `c145480` | CLEAN |
| `filmatta-profiles-talent` | `6d413ab` | CLEAN |
| `G:\PROYECTOS\filmatta` / codex/billing-preview | `8d3c280` | DIRTY, ajeno al trabajo; no se tocó |

Los 19 commits exclusivos iniciales, del más antiguo al reciente: `c5c87f6`, `2df377c`, `1bbe643`, `a8ed6ec`, `a3eff25`, `dc02a73`, `cfecabb`, `e9c105a`, `a96729f`, `1470797`, `c970dec`, `ee60731`, `1243c4b`, `92f96a2`, `e3a1da1`, `093b426`, `1c838ac`, `eb85072`, `d6a2dcd`.

## Cambios de esta reanudación

No fue necesario cambiar código del producto, schema, políticas, variables ni datos de clientes. La implementación ya satisfacía los bloques A–E.

`b374081838712436fe3b9a06f44ba0842b98e39a`: corrige las pruebas remotas heredadas de Jobs, catálogos y Services. Antes esperaban acceso administrativo a borradores con AAL1, en contradicción con `20260918010000_admin_mfa.sql`. Ahora comprueban rechazo AAL1, realizan enroll/challenge/verify TOTP real con el admin QA desechable y comprueban acceso AAL2. No se cambia Auth ni RLS del producto. Los factores desaparecen al eliminar el usuario temporal.

El commit de este informe añade evidencia exclusivamente. El código de aplicación sigue siendo idéntico al desplegado en `eb850724da074ce2e180724082e5661091644eba`; no hace falta redeploy para cambios de tests/documentación.

## Implementación preservada

- **Social:** `profile_follows`; herramientas privadas al final de `/mi-perfil`; `/mi-red` con Seguidores/Siguiendo y unfollow. RPC derivada de `auth.uid()`, sin parámetro para descargar la red ajena.
- **Social proof:** proyección fija de hasta siete identidades publicadas, cinco visibles en móvil y `+N`. Sólo retratos o fallback de identidad; nunca Reel ni video.
- **Contact Requests:** se extiende `catalog_inquiries`, sin crear otra bandeja incompatible. Historial anterior recibido/enviado y respuesta única permanecen accesibles. Los nuevos envíos pasan al modelo de solicitud, sin chat.
- **Créditos:** available → reserved al enviar; reserved → consumed al aceptar; rejected/cancelled/expired → released. Cinco créditos Free según la política existente, con consumos previos incluidos. Pro conserva fair use.
- **Atomicidad:** RPC/transacción, bloqueo por remitente, bloqueo de solicitud y unicidad de pending. Aceptar escribe estado, consumo, timestamps, snapshot y notificación juntos; doble aceptación idempotente.
- **Expiración:** 48h, transaccional al consultar/operar. El saldo no retiene reservas vencidas. Recordatorio deduplicado durante las seis horas previas, generado por actividad; no hay scheduler offline.
- **Contacto:** `profile_private_settings` canónico, cuatro consentimientos explícitos desactivados por defecto. Sólo canales autorizados y no vacíos en `shared_contact_snapshot`; `accepted_at` y `contact_unlocked_at`. Históricos inmutables, lectura limitada por participante/RLS.
- **Projects V0:** amplía `public.projects`; privado, owner-only, slug estable y snapshot mínimo adjunto. Campos: título, tipo, cliente opcional/tipo, ciudad/zona, jornada, modalidad económica, fecha/ventana, resumen, roles, requisitos. Reutiliza taxonomías de perfiles/preferencias; no implementa matching ni presupuesto.
- **Notifications:** cinco eventos, campana con ocho recientes, badge, navegación, `read_at` y marcar leídas; RLS por usuario, sin inserciones arbitrarias de clientes.
- **Global +:** Proyecto → `/proyectos/nuevo`; Locación → `/mis-locaciones/nueva`; Servicio → `/mis-servicios/nuevo`. Se reutilizan los flujos existentes.
- **Email:** helper histórico con lectura autenticada + RLS preservado sin cambios. Networking genera outbox privado, no envía Resend desde el nuevo flujo. Integración de entrega queda pendiente explícitamente; no se configura proveedor ni se envía correo en este Work.

Rutas: `/mi-perfil`, `/mi-red`, `/cuenta/contactos`, `/cuenta/contactos/[id]`, `/proyectos`, `/proyectos/nuevo`, `/proyectos/[slug]`, `/mis-proyectos`, `/notificaciones`.

## Migraciones y estado Test

No se añadió ni reaplicó ninguna migración durante esta reanudación. La feature contiene 14 migraciones posteriores a main: diez de Profiles V2/Social y estas cuatro de Networking, ya aplicadas en Test:

1. `20260924040000_networking_projects_channels.sql`
2. `20260924050000_networking_requests_notifications.sql`
3. `20260924060000_networking_private_views.sql`
4. `20260924070000_networking_outbox_legacy_history.sql`

Auditoría actual: RLS activo en `projects`, `catalog_inquiries`, `profile_private_settings`, `profile_follows`, `contact_credit_reservations`, `notifications` y `private.network_email_outbox`. Existen las diez RPC principales de Projects, canales, solicitudes, wallet, red, notificaciones e historial. No se consultó ni reconcilió el ledger.

## Preview y QA

[Preview exacta](https://app-3k9qkftlp-filmatta.vercel.app) — Vercel **READY**, deployment `dpl_4YrcpyjeRiXu1joMPU21DpUxSQbb`, commit `eb850724da074ce2e180724082e5661091644eba`, rama `feature/profiles-portfolio-polish`. CLI y API confirmaron metadatos. El 403 inicial se resolvió tras usar la autenticación normal de Vercel CLI; no se creó bypass.

- [Login](https://app-3k9qkftlp-filmatta.vercel.app/login): `networking-productor-review@example.invalid` y `networking-actriz-review@example.invalid`. Credenciales temporales entregadas sólo en chat.
- [Perfil Cine](https://app-3k9qkftlp-filmatta.vercel.app/perfiles/demostraci-n-c)
- [Actriz QA](https://app-3k9qkftlp-filmatta.vercel.app/perfiles/actriz-q)
- [Mi perfil](https://app-3k9qkftlp-filmatta.vercel.app/mi-perfil)
- [Mi red](https://app-3k9qkftlp-filmatta.vercel.app/mi-red)
- [Contactos](https://app-3k9qkftlp-filmatta.vercel.app/cuenta/contactos?box=accepted)
- [Project demo La última noche — owner Productor](https://app-3k9qkftlp-filmatta.vercel.app/proyectos/la-ultima-noche-141ea7f9)

El recorrido UI completo crear → adjuntar → reservar → aceptar → consumir → desbloquear ya estaba registrado en [el informe anterior](networking-foundation-v1-review.md). En esta reanudación se repitió la integración Auth/RLS completa con fixtures nuevos y cleanup, y se comprobó en la Preview: login Productor, contacto aceptado con sólo email/Instagram autorizados, snapshot del proyecto, saldo, proyecto guardado con URL estable, Mi red, herramientas privadas al final, menú + y campana. Abrir la notificación de rechazo navegó a la solicitud sin datos desbloqueados y redujo el badge de 9 a 8.

Revisión visual actual: escritorio 1440px y móvil 390px, sin overflow. Orden móvil medido: identidad → Bio → disponibilidad → Reel → Videos → Book → CV → preferencias → contacto → social proof. Siete avatares desktop / cinco mobile. Se conservan también las evidencias previas de los seis breakpoints; no se afirma haber repetido todos en esta reanudación.

Estado demo actual: 1 accepted, 1 rejected, 1 cancelled, 2 pending, 2 expired. Productor: 3 disponibles / 1 reservado / 1 consumido. Las demos pendientes siguen venciendo normalmente; no se congelaron fechas.

## Validación actual y fallos resueltos

| Suite / comprobación | Resultado final |
|---|---|
| Suite local completa, sin integración remota | PASS — 263/263, 0 fallos, 0 skipped |
| Networking remoto: Auth/RLS, concurrencia, consentimientos, snapshots, Projects, red y notificaciones | PASS — recorrido y cleanup |
| Jobs remoto | PASS |
| Catálogos previos / Profiles y Opportunities remoto | PASS |
| Presentación Profiles remota | PASS |
| Security/MFA/Storage/cuotas remoto | PASS |
| Services remoto | PASS |
| TypeScript | PASS |
| Lint focalizado de feature | PASS — 0 errores; 1 warning existente de img en Cuenta |
| Lint de pruebas modificadas | PASS — 0 errores ni warnings |
| Build local | PASS |
| git diff --check | PASS |

El primer reintento concurrente de las cinco integraciones tuvo cuatro bloqueos SQL de Test (`28P01`/`ECIRCUITBREAKER`, `XX000`) y un fallo de expectativa AAL1 obsoleta. Se conservó el rechazo de seguridad, se corrigieron las expectativas de las tres suites afectadas y se ejecutaron las cinco en serie. Resultado definitivo: **5/5 PASS**, sin skips. No se cambió ninguna contraseña SQL ni variable persistente. No se clasifica el fallo de expectativa como infraestructura.

Para repetir las integraciones heredadas, usar configuración existente verificada como Test y `node --test --test-concurrency=1` con `jobs.test.mjs`, `previous-catalogs.test.mjs`, `profile-presentation.test.mjs`, `security-blockers.test.mjs` y `services.test.mjs`. Evitar ejecutar sus inicializaciones SQL en paralelo. El escenario `tests/integration/networking.test.mjs` se ejecuta por separado.

Cleanup final actual: cero usuarios/grants `network-qa-*`; cero usuarios `catalog-*`, proyectos de fixture, cursos y objetos Storage `security-qa/catalog-*`. Permanecen las siete cuentas deliberadas de review y las demos previas de Profiles. No se dejaron scripts temporales nuevos ni secretos en archivos.

## Checklist final

| Criterio | Estado |
|---|---|
| Networking branch sincronizada con main | PASS |
| Contacto Operativo V1 preservado | PASS |
| Profiles V2 sin regresiones | PASS |
| Mi Red privada | PASS |
| Follower preview ~7 | PASS |
| Credits reserve | PASS |
| Credits consume | PASS |
| Reject release | PASS |
| Expire release | PASS |
| Contact private before accept | PASS |
| Contact unlock after accept | PASS |
| Contact snapshot | PASS |
| Snapshot RLS | PASS |
| Projects V0 | PASS |
| Project private | PASS |
| Project attach | PASS |
| Project snapshot | PASS |
| Contact Requests UI | PASS |
| Notifications | PASS |
| Unread badge | PASS |
| Global + | PASS |
| Location create preserved | PASS |
| Service state correct | PASS |
| Mobile regression | PASS |
| Auth Test | PASS |
| RLS Test | PASS |
| TypeScript | PASS |
| Lint | PASS |
| Build | PASS |
| git diff --check | PASS |
| Worktree clean | PASS después de registrar este informe |
| main untouched | PASS |
| Production untouched | PASS |

Sin blocker funcional encontrado en Networking. Pendientes declarados: worker/proveedor del outbox, recordatorios offline, reactivación y funcionalidades futuras fuera del scope. **Esperar review del usuario; no merge ni deploy Production.**
