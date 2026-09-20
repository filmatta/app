# PROFILES + TALENT PREVIEW VALIDATED — READY TO MERGE

Fecha: 19 de septiembre de 2026 (México). Sin merge, deploy ni migración Production.

## Rama y sincronización

- Rama: `feature/profiles-talent-polish`.
- Worktree: `G:\PROYECTOS\filmatta-profiles-talent`.
- HEAD inicial y merge-base inicial: `101a26cf203448e806716d80891da704cfb8c214`.
- origin/main integrado: `b09684a6dc356d34bcc279e2048b845c641326b1`.
- Nuevos commits de main: `1452d1b` Google OAuth; `b09684a` recuperación portable de contraseña.
- Trabajo previo guardado y rebase limpio, sin conflictos. HEAD tras rebase: `915bb1d0963391bcb57a2db82916685b7bb98316`.
- Código desplegado: `509964df929513ff22c06ba61dae23031c0be60b`. Los commits de cierre agregan pruebas/evidencia; el código de aplicación y SQL es idéntico al Preview.
- La rama queda con commits locales. No se ha hecho push.

## Migración Test y Production pendiente

Aplicada exclusivamente a `ezlycwkuzkwcnhrhiruv`:
`supabase/migrations/20260920010000_profile_presentation.sql`.

Historial y contenido exacto comprobados: [registro](test-migration.json). [Auditoría completa](migration-audit.md).

Añade presentation (retrato, alias, zona, rango, book y créditos), CHECK de validación, validador privado y tres RPCs. Mantiene una sola identidad professional_profiles. No altera policies ni RPCs anteriores.

Comparación antes/después y tras limpieza: mismos datos previos, RLS activo, policies, definiciones y grants de RPCs anteriores sin cambios. [Antes](test-schema-before.json), [después](test-schema-after.json), [limpieza](test-cleanup.json).

Permisos comprobados con Auth/PostgREST reales: owner puede leer/guardar; non-owner no lee la fila privada ni escribe otra identidad; anon no accede a tabla/guardado. Publicación, borrador, republicación, filtros de ciudad/disciplina/disponibilidad, Talento derivado, JSON inválido y rollback atómico, contratos antiguos: aprobados.

**Pendiente exacto de Production:** esta única migración. Primero preflight de dependencias/historial Production, luego schema, después aplicación. Rollback preferido: aplicación anterior manteniendo la columna y RPCs aditivas para preservar material. No ejecutar DROP de datos como rollback normal.

## Preview

[https://app-d9ahfbbb8-filmatta.vercel.app](https://app-d9ahfbbb8-filmatta.vercel.app)

Deployment `dpl_FX13QsfUCszR9c4tvNpy53z3CYUP`, Ready, target Preview, rama correcta. [Metadatos](deployment.json).

Usa Supabase Test; Billing desactivado y modo test. Sólo en este deployment se anularon secretos Stripe, Mux, OpenAI y service role, en build y runtime. No se editaron variables compartidas ni Production. La clave administrativa Test se usó sólo localmente para crear/eliminar usuarios sintéticos; lecturas y mutaciones de perfil se probaron con sesiones normales.

Vercel mantiene su protección. El enlace necesita una cuenta autorizada del equipo. El acceso temporal de QA se revocó. Los fixtures se eliminaron: las capturas preservan los ejemplos poblados y los slugs QA ya no son perfiles vivos.

## Rutas y revisión visual

En Preview real, Chrome, anchos **390 / 768 / 1024 / 1280 / 1440 / 1920**:

- /descubre/perfiles
- /descubre/talento
- /perfiles
- /talento
- /perfiles/[slug], variante profesional y variante Talento
- /mi-perfil con sesión real Test

42 combinaciones. Sin overflow horizontal, imágenes rotas ni errores de página en la matriz. Inspección visual de jerarquía, recortes, filtros y formularios: aprobada. Acento #B9DCEB moderado sobre carbón; reel protagonista; retrato/book más fuerte en Talento; cards visuales; filtros mobile plegables; mismo modelo y URL de perfil.

Mi perfil: vista previa privada, alias, guardado mediante Server Action, orden de piezas persistido, despublicación y republicación real comprobados. Anónimo redirigido a login; borrador por URL devuelve 404; contacto protegido y sin email/teléfono/auth metadata. El reel carga iframe sólo al click, sin autoplay; se conserva acceso al original. No se certifica disponibilidad futura de proveedores externos ni todos sus videos.

[Galería comparativa](preview-review.html): **57 capturas remotas**, incluyendo 42 viewports, 14 páginas completas y un vacío con filtro. [Matriz](preview/matrix.json).
[Estados locales](states): 6 capturas adicionales de loading, vacío y error en 390/1440. Los fallos se indujeron únicamente en el fixture local; no se alteró la disponibilidad de Test para generarlos.

## Pruebas

| Verificación | Resultado |
|---|---|
| Profiles/Talent, catálogo, DB/RLS, navegación, Auth, Security, Billing | 159/159 |
| Auth/PostgREST real en Supabase Test | 1 suite completa aprobada |
| Navegador local: navegación/header/cuenta y perfiles | 31/31 |
| Navegador local: estados loading/empty/error | 1/1 |
| Navegador Preview real | 1 recorrido completo aprobado; 42 combinaciones y edición/publicación |
| TypeScript | aprobado |
| Lint focalizado | sin errores ni avisos |
| Production build local con Test | aprobado |
| Build Vercel Preview | Ready |
| git diff --check | aprobado |

Evidencia: [regresión](regression.txt), [integración Test](test-integration.txt), [navegador local](local-browser.txt), [estados](states-browser.txt), [Preview](preview-browser.txt), [build](build.txt), [checks](checks.txt).

Auth incluye las regresiones nuevas de main. Billing se valida por su suite; el Preview no ejecuta checkout, pagos ni webhooks. No se usaron secretos Production.

## Deuda y límites

- Contacto entre perfiles y Follow operativos siguen pendientes; el botón protegido informa que las solicitudes aún no están habilitadas. Sin contador público.
- Material por URL. Subida directa y procesamiento/limpieza de archivos siguen pendientes; no se añadió Mux.
- Links/embeds externos dependen de su proveedor. Se mantienen fallbacks y enlace original.
- Rango opcional libre y zona aproximada; no Map V1.
- Boost/Talent+, matching, feed y ranking quedan fuera de esta fase.
- Antes de Production queda la migración indicada y la aprobación de merge/deploy. No hay bloqueos encontrados para revisar/mergear esta feature.

## Diff contra origin/main

[Inventario de archivos](final-files.md). Diff completo reproducible:
`git diff origin/main...HEAD`.
No hay diferencias contra main en Auth, Navigation compartida, Billing, Security, Learn Assistant o Mux. El cambio de navegación editorial está limitado al render de las dos landings de Perfiles/Talento. Las pruebas y evidencia añadidas no cambian esos sistemas.

La revisión inicial local queda como antecedente en [README](README.md). Este documento sustituye sus pendientes de sync, migración Test y Preview.
