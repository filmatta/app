# Networking Foundation V1 — Final UX/UI review

Fecha: 2026-09-21. Sólo Supabase Test y Vercel Preview. Pendiente de review visual del usuario; sin merge ni deploy Production.

## Entrega

- Rama: `feature/profiles-portfolio-polish`.
- Worktree: `G:\PROYECTOS\filmatta-profiles-polish`.
- Base de este Work: `8eef6208e794ff90d7dc15ed665b3dbdc0325a0e`.
- Implementación: `ad3e4758d62f2bbdb7552d3a4ad2fd8c0f9d080d`.
- Correcciones después de QA visual y candidato desplegado: `d626a4eb3709392801879788624d875296d31d0a`.
- main y origin/main conservan `a2e89353698e1c6ec163f06fddf0a1e9ecf2f985`.
- Preview Ready: https://app-lco0rp9wk-filmatta.vercel.app
- Deployment: `dpl_AhqJnzukECD9KFcYdveVL9bzYi9Z`.
- Supabase efectivo de Preview verificado: `ezlycwkuzkwcnhrhiruv`.
- No se modificaron variables, Auth, Billing ni configuración Production.

## Enlaces para review

- Login: https://app-lco0rp9wk-filmatta.vercel.app/login
- Proyecto demo: https://app-lco0rp9wk-filmatta.vercel.app/proyectos/umbral-demo-ux-qa-cd01b951
- Mis proyectos: https://app-lco0rp9wk-filmatta.vercel.app/mis-proyectos
- Alias compatible: https://app-lco0rp9wk-filmatta.vercel.app/proyectos
- Crear: https://app-lco0rp9wk-filmatta.vercel.app/proyectos/nuevo
- Solicitudes: https://app-lco0rp9wk-filmatta.vercel.app/cuenta/contactos
- Aceptadas: https://app-lco0rp9wk-filmatta.vercel.app/cuenta/contactos?box=accepted_requests
- Contactos abiertos: https://app-lco0rp9wk-filmatta.vercel.app/cuenta/contactos?box=accepted
- Editor: https://app-lco0rp9wk-filmatta.vercel.app/mi-perfil
- Perfil completo demo: https://app-lco0rp9wk-filmatta.vercel.app/perfiles/demostraci-n-c

Se reutilizó la cuenta Productor QA de Test. Credenciales de review entregadas en el chat, sin persistir contraseñas aquí.

## Cambios

Projects ahora separa estado operativo (Activo / Por confirmar / Inactivo), archivado y visibilidad privada. Cards y detalle muestran tipo, ciudad, jornada, modalidad, fecha y roles reales. El formulario se agrupa en Información básica, Producción y Necesidades; requiere al menos un rol. Crear muestra «Proyecto creado» y abre `/mis-proyectos?created=1`; editar muestra «Cambios guardados» conservando el contexto. El aviso de cambios pendientes cubre enlaces internos y salida/recarga del documento; no se añadió un router alternativo.

Componentes compartidos: StatusBadge, MetaChip/MetaChips, FilmattaAccordion, SelectionRow, FeedbackToast y CreditIcon. Tokens centralizados para success, warning, danger, neutral e info; Plus/Pro reutilizan sus estilos existentes. Los indicadores contienen texto y los tags se limitan con +N. Accordions tienen header completo, resumen, aria-expanded/controls y contenido montado al cerrar. Las filas conservan inputs nativos accesibles, estado seleccionado y foco visible.

Profiles reutiliza accordions para información, preferencias, disciplinas y habilidades/equipo. Disponibilidad y preferencias usan estados semánticos. El consentimiento explícito de publicación permanece intacto. Durante QA se corrigió la regla genérica del editor que sobrescribía el layout de SelectionRow.

Solicitudes añade Aceptadas entre Enviadas y Vencidas, reutilizando la consulta accepted existente. «Ver contacto» dirige a la página y ancla correspondientes. Contactos muestra Contacto activo y sólo los canales autorizados del snapshot. Historial queda secundario. Créditos usan icono y pequeñas métricas, con singular/plural correctos.

Notificaciones incorporan foto de identidad del actor publicado o fallback; nunca Reel/cover. Los eventos de sistema usan reloj. Tipo y título del proyecto se proyectan desde datos autorizados. La tarjeta de identidad del menú enlaza completa a Mi perfil; Cuenta queda secundaria. Ambos headers comparten lectura de identidad autenticada; en móvil la tarjeta aparece al principio del panel.

## Base de datos

Migración `20260925010000_networking_ui_metadata.sql`, aplicada únicamente a Test:

- Agrega `projects.operational_status`, text NOT NULL DEFAULT active, con constraint de tres valores.
- Extiende `save_my_networking_project` para estado operativo y mínimo un rol; conserva ownership, bloqueo y privacidad.
- Extiende la proyección de `get_my_network_notifications` con identidad pública del actor y contexto de proyecto sólo para participantes.
- Sin cambios a policies/RLS, sin tablas decorativas, sin reconciliación de ledger.
- Los tres proyectos previos conservaron su contenido al aplicar la migración (comparación excluyendo la nueva columna).
- Postflight: RLS activo en projects, professional_profiles, catalog_inquiries y notifications.

## QA ejecutado

Navegación real en Preview con login/password y sesión Supabase Test. Desktop de 1440 CSS px y móvil de 390 CSS px. Revisados proyectos, creación, detalle, editor de perfil, solicitudes, contactos, notificaciones y menú. Cards y tabs sin desbordamiento horizontal; filas y accordions utilizables por teclado y touch.

Se creó desde el formulario «Umbral · Demo UX QA», con Actuación/Sonido, jornada nocturna y modalidad pagada. Se comprobó rechazo de cero roles, selección por fila, teclado, persistencia al cerrar accordion, tres estados, archivado/restauración, toast/redirect y aviso de cambios pendientes. Estado final de la demo: Activo, privado.

Aceptadas conserva Foto Q. y Actriz Q.; el enlace al contacto de Actriz Q. llega a su ancla. Canales compartidos: únicamente los previamente consentidos. Notifications comprobó Follow, solicitud, aceptación y expiración; foto cargada del perfil demo Cine, fallback de inicial y reloj de sistema. Se añadió una conexión intencional Cine → Productor mediante Auth/RLS para revisar ese avatar.

Perfil completo: badges y preferencias públicas, thumbnails, Book/lightbox (siguiente y Escape), CV y Reel existentes. El video nativo de Mux llegó a readyState 4 y final de reproducción (16,75 s). Catálogo Talento sigue sin texto Reel ni fuentes de video en identidad. No se repitió una nueva subida Mux ni toda la suite remota de media: esta vuelta no cambia esos flujos.

Los cambios explorados en preferencias de Productor se cerraron sin guardar. No se alteraron sus consentimientos. Se conservan las demos de review; los 13 usuarios temporales de la suite remota fueron eliminados. Postflight: cero usuarios `network-qa-*` y cero proyectos temporales «Proyecto privado QA». No se agregaron scripts de fixtures temporales.

## Validación técnica

- Suite local completa: **270/270 PASS**, 0 skipped, 0 fallos.
- Focalizados de navegación/identidad, flujo Project/Accepted y presentación social: **13/13 PASS**.
- Integración remota Networking: **PASS**, login real + Auth/RLS en Test; concurrencia de créditos/aceptación, snapshots, ownership, privacidad de proyectos, Follow, notificaciones y estados operativos.
- TypeScript: **PASS**.
- Lint focalizado en todos los archivos de este Work: **PASS**, 0 errores y 0 warnings.
- Build local: **PASS**, 45 páginas generadas. Build Vercel del candidato: **PASS / READY**.
- `git diff --check`: **PASS**.
- No se ejecutaron de nuevo las otras suites remotas heredadas ajenas al cambio; no se presentan como verificadas en esta vuelta.

## Checklist solicitado

PASS se refiere al alcance de este Work, con QA visual/funcional y tests según el apartado anterior; no afirma una recertificación completa de verticales ajenas.

| Criterio | Resultado |
| --- | --- |
| Project status Activo | PASS |
| Project status Por confirmar | PASS |
| Project status Inactivo | PASS |
| Archive separado | PASS |
| Privado separado de status | PASS |
| Status badges | PASS |
| Project meta tags | PASS |
| Project create redirect | PASS |
| Toast creado | PASS |
| Accordion component reusable | PASS |
| Accordion summary | PASS |
| Checkbox rows custom | PASS |
| Whole-row click | PASS |
| Required multiselect | PASS |
| Profiles accordions normalized | PASS |
| Profile badges | PASS |
| Profile meta tags | PASS |
| Requests status badges | PASS |
| Accepted tab | PASS |
| Accepted card | PASS |
| Accepted → Contactos | PASS |
| Contacts metadata | PASS |
| Credits icon | PASS |
| Credits metrics UI | PASS |
| Notification avatars | PASS |
| System notification icon | PASS |
| Notification metadata badges | PASS |
| Menu card says Mi perfil | PASS |
| Menu card links /mi-perfil | PASS |
| Cuenta still accessible | PASS |
| Meaningful badges across entities | PASS |
| Meaningful tags across entities | PASS |
| Empty states improved | PASS — implementación revisada; vistas vacías de solicitudes/editor observadas |
| Desktop polish | PASS |
| Mobile polish | PASS |
| Networking functionality no regressions | PASS — suite local + integración real Test |
| Profiles no regressions | PASS — tests + smoke de perfil/media/editor |
| Projects privacy intact | PASS |
| Contact RLS intact | PASS |
| Notifications intact | PASS |
| TypeScript | PASS |
| Tests | PASS |
| Lint | PASS |
| Build | PASS |
| git diff --check | PASS |
| Worktree clean | PASS — estado Git vacío tras guardar el reporte |
| main untouched | PASS |
| Production untouched | PASS |

## Límites y siguiente paso

No hay blocker funcional detectado en el alcance revisado. Un proyecto previo de Test sin roles conserva sus datos; al editarlo deberá seleccionar al menos uno. No se añadieron Search, matching, chat, entitlement Pro, nuevas verticales ni email.

Queda pendiente la revisión visual del usuario y cualquier autorización futura de integración. Esta migración aún no se ha aplicado a Production. El commit posterior que incorpora este reporte sólo añade documentación; el código desplegado corresponde exactamente a d626a4e.
