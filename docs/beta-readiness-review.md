# Beta Readiness — UX cleanup, Mi cuenta y Project compartido

2026-09-21 · Test/Preview únicamente · pendiente de review visual del usuario.

## Entrega

- Rama `feature/profiles-portfolio-polish`, worktree `G:\PROYECTOS\filmatta-profiles-polish`.
- Base: `11a085f44a74a6eece3de234753c69299d2ffeaf`.
- Implementación: `9ec72ad`.
- Correcciones visuales y candidato Preview: `3c8e48cf8533675f6852073f091f3f5ef20400b3`.
- Preview Ready: https://app-om6bj34hu-filmatta.vercel.app
- Deployment: `dpl_ARHQbqE5baGQweTQ3bgLqwNkHWSt`.
- Supabase efectivo verificado: Test `ezlycwkuzkwcnhrhiruv`.
- main y origin/main permanecen en `a2e89353698e1c6ec163f06fddf0a1e9ecf2f985`.
- El commit posterior de este reporte sólo incorpora documentación y limpieza de una línea vacía en CSS; sin diferencia de comportamiento respecto al Preview.

## URLs de revisión

- Dashboard: https://app-om6bj34hu-filmatta.vercel.app/mi-cuenta
- Login directo: https://app-om6bj34hu-filmatta.vercel.app/login?next=%2Fmi-cuenta
- Editor: https://app-om6bj34hu-filmatta.vercel.app/mi-perfil
- Mis proyectos: https://app-om6bj34hu-filmatta.vercel.app/mis-proyectos
- Project demo owner: https://app-om6bj34hu-filmatta.vercel.app/proyectos/umbral-demo-ux-qa-cd01b951
- Project compartido con Actriz QA: https://app-om6bj34hu-filmatta.vercel.app/proyectos/la-ultima-noche-141ea7f9
- Solicitudes/contactos: https://app-om6bj34hu-filmatta.vercel.app/cuenta/contactos
- Perfil público: https://app-om6bj34hu-filmatta.vercel.app/perfiles/demostraci-n-c

Se reutilizaron Productor QA y Actriz QA. Credenciales de review disponibles en el chat; no se guardan contraseñas en este documento.

## UX y datos

Los tres botones de edición profesional tienen gap real de 10 px. El estado de disponibilidad tiene 18 px de separación respecto a Información profesional. Ambas medidas comprobadas en navegador, desktop y móvil. Se corrigió la regla anterior que sobrescribía el gap.

Guardar, tanto creando como editando, persiste y abre Mis proyectos con feedback en destino: «Proyecto creado» o «Cambios guardados». La URL usa `?created=1` o `?saved=1` para mostrar el toast. Archive/restore sigue separado y permanece en editor. Los errores de guardado mantienen los datos en el formulario. El editor inline de una solicitud conserva su callback existente para no perder la solicitud en preparación.

Créditos tiene encabezado «Créditos de contacto», métricas con significado, icono y explicación. Los badges pueden pasar a segunda línea. No cambia reserve/consume/release, ni precios ni entitlements.

`/mi-cuenta` es un dashboard privado: header compacto, seis accesos rápidos, último proyecto actualizado si existe y configuración. `/cuenta` conserva la biblioteca y los formularios existentes con sus anchors; su header dejó de decir FILMATTA Learn y añade acceso visible al dashboard. No se cambiaron Auth/MFA ni los destinos next explícitos. La identity card sigue enlazando a Mi perfil y Mi cuenta queda como acceso secundario claro.

Datos reales bajo sesión + RLS:

| Superficie | Fuente |
| --- | --- |
| Perfil publicado/borrador, identidad | professional_profiles del usuario |
| Activos / por confirmar | counts exactos de projects propios, privados y no archivados |
| Solicitudes y red | get_my_network_summary existente |
| Locaciones publicadas | count exacto de locations propias publicadas |
| Último Project | projects propios ordenados por updated_at |
| Plan Plus/Pro cuando disponible | getBillingAccess existente |

No se inventan datos si una consulta falla: se omite la métrica y aparece aviso compacto. No se muestran visitas, gráficas, eventos de actividad inventados, skills de Project inexistentes ni «curso reciente» sin una consulta específica fiable. Learn enlaza a la biblioteca real. El badge de plan sólo se muestra cuando el helper confirma Plus/Pro; un resultado nulo no se presenta como FREE porque también puede indicar configuración no disponible. Cuenta/suscripción permanece accesible siempre. No se añadieron widgets de facturación ni preferencias de notificación inexistentes.

## Project View autorizado (secciones 52–60)

Migración `20260925020000_authorized_project_view.sql`, aplicada únicamente en Test. Los cinco Projects existentes conservaron todos sus campos previos, verificados mediante hash antes/después excluyendo la columna nueva.

- RPC `get_authorized_networking_project` devuelve una proyección explícita y limitada.
- Owner: puede leer y editar como antes.
- Receptor con solicitud pendiente no vencida o aceptada: puede abrir readonly.
- Una solicitud debe pertenecer realmente al Project y su sender debe ser el owner del Project.
- Tercero/anónimo: denegado. Solicitudes rechazadas/canceladas/vencidas no conceden acceso live.
- Inactivo/Archivado no revoca una relación aceptada; la ficha mantiene acceso histórico autorizado.
- No se amplió SELECT directo sobre projects: RLS y policies existentes permanecen intactas.
- No se devuelve información privada de Auth ni contacto del owner.
- `share_client_name` nuevo, boolean NOT NULL DEFAULT false: consentimiento explícito del owner en editor para compartir nombre de cliente/artista. Sin consentimiento, se omite para el receptor.
- Un índice parcial soporta el lookup de Project/receptor.
- La proyección de solicitud añade `project_slug` autorizado; el título del snapshot enlaza a la ficha actual.
- El snapshot, sus triggers de inmutabilidad y las transacciones de créditos permanecen iguales.

La ficha readonly comunica «Proyecto compartido · Sólo lectura», owner profesional público, estado, descripción, roles, características y requisitos existentes. No renderiza controles de edición, archivado ni configuración.

## QA real

Desktop 1440 CSS px y móvil 390 CSS px. Preview real con sesiones de Productor, Actriz y una cuenta vacía temporal.

- Dashboard poblado y vacío; una columna en móvil; sin overflow.
- Accesos a Mi perfil, Mis proyectos, Solicitudes, Mi red, Mis locaciones, Learn y configuración usados realmente.
- Owner editó Umbral: ciudad pasó a «Guadalajara · QA»; toast observado, redirect correcto y card actualizada.
- Cuenta vacía creó Projects: persistencia, redirect y «Proyecto creado» capturado. La cuenta y los tres Projects temporales se eliminaron después.
- Spacing final medido: 10 px / 18 px. Créditos comprobados en lista y perfil público; wrap móvil.
- Actriz abrió La última noche desde Aceptadas: readonly real a ambos anchos; sin formulario ni datos de contacto privados.
- Actriz intentó abrir Umbral sin relación: 404 sin información del Project.
- Anónimo intentó abrir La última noche: login sin revelar contenido.
- Integración real Test comprobó pending, accepted, archived/inactive, consentimiento de cliente, snapshot original tras cambios y rechazo de escritura non-owner.
- No se modificaron Reel, Book, Videos, thumbnails, playback firmado, Lightbox ni CV.

Cleanup confirmado: cero usuarios temporales `network-qa-*` y cero cuenta/proyectos de `beta-readiness-empty-20260921`. Los 13 usuarios de integración, sus datos y el grant temporal se eliminaron por el tooling existente. Se mantienen las demos intencionales de review, incluida Umbral con su cambio de ciudad.

## Validación

- Suite local completa: **273/273 PASS**, 0 skipped, 0 fail.
- Focalizados: **15/15 PASS** (dashboard, Projects, permisos, solicitudes y UI).
- Auth/RLS remoto Test: **PASS**, con limpieza confirmada.
- TypeScript: **PASS**.
- Lint focalizado: **PASS**, 0 errores; un warning preexistente de `<img>` en la biblioteca de `/cuenta` (no se cambió ese renderer).
- Build local y build Vercel del candidato final: **PASS**; Preview READY, 46 páginas.
- `git diff --check`: **PASS** tras eliminar una línea vacía final.
- Worktree limpio después del commit de reporte.
- main y Production intactos; sin merge, sin push a main, sin cambios de variables.

## Checklist

| Criterio | Resultado |
| --- | --- |
| Profile edit buttons spacing | PASS |
| Availability → accordion spacing | PASS |
| Credits label | PASS |
| Credit badges contextualized | PASS |
| Project create redirects | PASS |
| Project edit redirects | PASS |
| Create toast | PASS |
| Edit toast | PASS |
| /mi-cuenta no es Learn dashboard | PASS |
| Compact account header | PASS |
| Quick links | PASS |
| Mi perfil link | PASS |
| Mis proyectos link | PASS |
| Solicitudes link | PASS |
| Mi red link | PASS |
| Locaciones link | PASS |
| Learn link | PASS |
| Real counts only | PASS |
| No fake recent activity | PASS |
| Plan badge if available | PASS — condicional al plan confirmado; no se otorgó un plan a las cuentas de review |
| Account configuration links | PASS |
| Empty state | PASS |
| Desktop | PASS |
| Mobile | PASS |
| Networking no regressions | PASS — tests locales + Auth/RLS real |
| Profiles no regressions | PASS — tests + smoke UI; media fuera del scope |
| Projects no regressions | PASS |
| Auth/RLS no regressions | PASS |
| Tests | PASS |
| TypeScript | PASS |
| Lint | PASS con warning previo indicado |
| Build | PASS |
| git diff --check | PASS |
| Worktree clean | PASS tras commit final |
| main untouched | PASS |
| Production untouched | PASS |
| Owner abre y edita | PASS |
| Receptor pending abre readonly | PASS — integración real Test |
| Receptor accepted abre readonly | PASS — integración + navegador |
| Tercero/anónimo denegado | PASS |
| Snapshot original y ficha live separados | PASS |
| Cliente oculto sin consentimiento | PASS |
| Archivado/Inactivo mantiene acceso aceptado | PASS |

## Beta readiness (11 preguntas)

Mi perfil, editar perfil, crear/guardar Project con feedback, Mis proyectos, Solicitudes, Mi red, comprensión de créditos, Learn y Configuración: **sí, flujos comprobados en Preview**. El guardado de perfil y registro conservan su implementación y cobertura de regresión existentes.

Crear cuenta: **registro existente preservado y cubierto por tests; no se repitió un alta pública con entrega de email en esta ronda**. La cuenta vacía se preparó en Test y su login se probó por el flujo normal. No presentar este QA como validación de entregabilidad de correo beta.

No hay blocker funcional detectado en los cambios entregados. Queda pendiente review visual del usuario y, antes de captar usuarios, confirmar el alta pública/email en el entorno que se abrirá a beta. No se implementó Search, matching, nuevas verticales, chat ni email nuevo. Ninguna migración Production fue ejecutada.
