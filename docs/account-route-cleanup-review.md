# Beta Readiness V1 — Cuenta canónica

Rama: `feature/profiles-portfolio-polish`. Sólo Test/Preview. Sin merge.

## Entrega

- `0abe21d0be764229e46bbb101b9f61199f9e713d`: unificación de rutas y compatibilidad.
- `2ee17d767faf56f65d1215edda56c3abf9054074`: label Configuración; commit desplegado.
- Preview Ready: https://app-d75qi5r05-filmatta.vercel.app
- Deployment: `dpl_4f8oT9w6X5MtbpxofYdXb3AeccxC` (Preview, no Production).
- Entorno Preview existente verificado contra Supabase Test `ezlycwkuzkwcnhrhiruv`; sin cambios de variables.

## Rutas finales

- Cuenta: https://app-d75qi5r05-filmatta.vercel.app/cuenta
- Mi perfil: https://app-d75qi5r05-filmatta.vercel.app/mi-perfil
- Solicitudes: https://app-d75qi5r05-filmatta.vercel.app/cuenta/contactos
- Configuración existente: https://app-d75qi5r05-filmatta.vercel.app/cuenta/configuracion#configuracion
- Biblioteca existente: https://app-d75qi5r05-filmatta.vercel.app/cuenta/configuracion#mis-cursos
- Login: https://app-d75qi5r05-filmatta.vercel.app/login?next=%2Fcuenta

`/mi-cuenta` ejecuta permanentRedirect('/cuenta'), sin renderizar otro dashboard. El título canónico es Cuenta | FILMATTA. La identity card sigue en /mi-perfil. El usuario confirmó trasladar la vista anterior completa a /cuenta/configuracion; no se añadieron formularios o funciones.

Los bookmarks /cuenta#mis-cursos, #configuracion, #seguridad y demás secciones anteriores se resuelven mediante un pequeño adaptador de fragmentos cliente (los hashes no llegan al servidor). El feedback antiguo de formularios se remite en servidor a la vista existente. Las acciones conservan validación, Auth y mutaciones; sólo cambian destinos de feedback y revalidación de la nueva ruta.

## Referencias actualizadas

- lib/navigation.ts y GlobalNavigation: Cuenta, menú desktop/móvil y aprendizaje/ajustes.
- Sidebars Account, Student y App: destinos existentes de biblioteca y configuración.
- Dashboard: login next, metadata, configuración, datos de contacto, seguridad y Learn.
- Cuenta/actions: retorno tras guardar y confirmar email; tests conservados.
- Suscripción: enlace de retorno a sección de pagos existente.
- Profile editor y ContactRequestCard: enlaces a datos de contacto; sólo href/copy, sin cambios de media o solicitudes.
- Admin, recuperación y consultas de servicios: wording Cuenta.
- networking-actions: invalidación del dashboard /cuenta; ninguna lógica de networking cambiada.
- Tests de navegación, Auth, E2E y selectores de smoke: rutas/labels actualizados.
- El reporte beta previo queda como evidencia histórica; este documento lo sustituye en URLs de Cuenta.

## QA real en Preview final

Cuenta QA existente: networking-productor-review@example.invalid. Contraseña sólo en el chat, no en repositorio.

- Login con next=/cuenta -> /cuenta: probado con contraseña real.
- Login con next=/mi-cuenta -> /cuenta: probado con contraseña real tras logout.
- Entrada directa /mi-cuenta -> /cuenta: probado.
- Bookmark /cuenta#configuracion -> /cuenta/configuracion#configuracion: probado.
- Desktop 1440 px y móvil 390 px; dashboard, menús, perfil y contactos inspeccionados visualmente. Sin overflow.
- Desktop y móvil: identity card abre Mi perfil; enlace Cuenta regresa al dashboard.
- Smoke: Cuenta -> Mi perfil -> Cuenta -> Mis proyectos -> Cuenta -> Solicitudes -> Cuenta -> Mi red -> Cuenta -> Learn.
- Biblioteca, seguridad y configuración existentes conservadas.
- Datos de Productor QA: 4 Projects activos, 0 por confirmar; 6 seguidores, 1 siguiendo; 0 locaciones publicadas. Sin métricas ficticias.
- No se crearon fixtures ni se guardaron cambios en perfiles, Projects o solicitudes. Sólo login/logout de cuenta QA existente.

## Validación y alcance

- Suite local completa: 276/276 PASS; 0 skipped, 0 fail.
- Focalizados Auth/navigation: 50/50 PASS.
- TypeScript: PASS.
- Lint focalizado: 0 errores; warning preexistente no-img-element en la biblioteca trasladada.
- Build local y Vercel final: PASS, 47 rutas.
- git diff --check: PASS.
- 0 migraciones nuevas, 0 ejecuciones SQL, 0 cambios de RLS.
- Tests remotos de mutaciones no repetidos: no se modificaron reglas de datos; login y lecturas QA usan Auth normal.
- main y origin/main intactos: a2e89353698e1c6ec163f06fddf0a1e9ecf2f985.
- Production intacta; no deploy Production ni cambios de variables.

## Checklist

| Criterio | Estado |
| --- | --- |
| /cuenta es dashboard canónico | PASS |
| /mi-cuenta redirige | PASS |
| Sin dashboard duplicado | PASS |
| Mi perfil label correcto | PASS |
| Mi perfil -> /mi-perfil | PASS |
| Cuenta label correcto | PASS |
| Cuenta -> /cuenta | PASS |
| User identity card sigue en /mi-perfil | PASS |
| Desktop navigation | PASS |
| Mobile navigation | PASS |
| Login next /cuenta | PASS |
| Legacy login next /mi-cuenta | PASS |
| /cuenta/contactos intacto | PASS |
| Dashboard sin regresiones | PASS |
| Profiles sin regresiones | PASS: suite local + smoke, media no modificada |
| Projects sin regresiones | PASS: suite local + navegación; sin mutaciones remotas |
| Networking sin regresiones | PASS: suite local + navegación; lógica intacta |
| Tests | PASS |
| TypeScript | PASS |
| Lint | PASS con warning previo |
| Build | PASS |
| git diff --check | PASS |
| Sin migraciones | PASS |
| Worktree clean | PASS tras commit del reporte |
| main untouched | PASS |
| Production untouched | PASS |

Pendiente únicamente review visual del usuario para este cambio. No merge autorizado.
