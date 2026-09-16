# Navigation, landings and catalog foundations

Base: c542b0a7c6e8ecd5ca578c1271819ebed46cfd49 (main = origin/main after fetch).
Branch: feature/navigation-landings-catalog-foundations.
Worktree: G:\PROYECTOS\filmatta-navigation-landings.

## Scope override
The execution brief explicitly advances public catalogs, derived Talent, service directory, Jobs and Tools foundations beyond the future scope in AGENTS.md. Depth and security take precedence over coverage. Jobs reuses opportunities. Tools uses a typed code registry. Public routes remain public according to existing policies. No Production deployment, remote migrations, fixtures, payments, Billing changes or integration of live-smoke-discount.

## Baseline audit
- /: versioned editorial Home and FILMATTA wordmark. Uncommitted Home work in the original billing checkout was not imported.
- /perfiles: presentation; /perfiles/[slug] and /mi-perfil use privacy-preserving RPCs. Public directory RPC absent.
- /locaciones and detail: published inventory. /mis-locaciones contains owner CMS.
- /oportunidades and detail: published opportunities linked to published projects; publishing UI absent.
- /cursos: existing Learn access, progress and playback, preserved.
- /cuenta: #mis-cursos and #configuracion available.
- Marketplace, Jobs, Talent and Tools routes absent at baseline.
- proxy.ts refreshes sessions without privatizing public catalogs.
- No Production environment or secrets copied into this worktree.

## A — Navigation
Shared public/authenticated navigation, server-validated role, unchanged subscription badge. Slash-separated desktop menu from 1440px; compact modal below. Disclosure buttons support click, Tab, Escape and outside click; mobile native dialog provides focus containment and restoration. Account and publishing links reuse authorized routes. Features enable only once their destination exists. UI role checks do not replace server authorization.

## Sources consulted
- [Home roadmap](https://docs.google.com/document/d/1cHL3YTvP5DvgSgEfzOFK-wNRV5gatXwb7nglXnq1180/edit)
- [Writer vision](https://docs.google.com/document/d/1xqC75YyhjfjZ_dSthU1nytKg-qpIcYaHmM4awOlU8jA/edit)
- [Production strategy](https://docs.google.com/document/d/16ljbRdGXK4Na7V7OvGPaNGcYwVjx3z8klfqOK5NrqXg/edit)
- themesh.art timed out; no visual inspection claimed.

## B — Editorial landings for existing verticals
Implemented /descubre/perfiles, /descubre/talento, /descubre/locaciones, /descubre/oportunidades and /descubre/learn. Marketplace/Jobs/Tools landings remain with their later product blocks, so no nonfunctional catalog CTA is introduced. Shared structure with distinct portfolio, portrait, panorama, brief and learning compositions. Pale blue Profiles/Talent; muted olive Locations, steel Opportunities and amber Learn. Home composition preserved, manifesto added, Profiles accent corrected.

Final copy lives in content/landings.ts. Descriptions explicitly acknowledge that private contact and applications are not functional in the baseline. Three local optimized WebP images, 528 KB combined; source/author/license/dimensions/focal point documented in content/image-sources.json. No stock person presented as a customer or registered professional.

Validation: 8 navigation/content unit tests; 12 Playwright tests covering server sessions (local transport fixtures), admin visibility, anonymous route protection, keyboard interaction and all seven requested widths. Corrected mobile reverse-Tab focus escape. Inspected full-page desktop/mobile captures for all five landings in docs/review. UI fixtures do not establish database authorization correctness.

## C — Catálogos existentes y publicación de oportunidades

Entrega de este checkpoint: Perfiles publicados, Talento derivado, Locaciones, Oportunidades y Learn. Filtros GET compartibles, consultas limitadas a 24 elementos más una fila de anticipación, orden con desempate estable y paginación anterior/siguiente. No se generan cifras de inventario. Se distinguen ausencia de migración, error de carga y cero resultados. Hay estados de carga y error por ruta; los límites de error usan `retry`, conforme a la documentación de Next.js instalada.

Perfiles consulta una proyección pública explícita mediante RPC. No se amplían permisos SELECT de la tabla profesional, ni se devuelven user_id, correo, teléfono o nombre privado. Talento filtra Actuación/Modelaje en la misma tabla; crear o editar sigue pasando por /mi-perfil y sus RPCs existentes. Modelaje se añade al selector de disciplinas. No se crea una segunda identidad.

Locaciones conserva su CMS, fotos, ciclo de publicación y ownership. Se añaden búsqueda por título, ciudad y entorno. Oportunidades filtra categoría, ciudad, título y modalidad; el proyecto publicado se filtra antes de paginar mediante la relación existente. Learn filtra título, categoría y nivel, con orden estable; no cambia acceso, progreso, grants ni playback.

`/mis-oportunidades` permite listar y editar publicaciones propias. `/mis-oportunidades/nueva` crea atómicamente un proyecto mínimo y una oportunidad. Por defecto queda en borrador; publicar requiere brief y ciudad cuando no es remoto. La UI explica que también se publica el título del proyecto. Editar conserva el slug compartido, y permite cerrar/archivar. El RPC deriva auth.uid(), comprueba propiedad y mantiene RLS mediante SECURITY INVOKER. La transacción evita proyectos huérfanos. La Server Action valida campos, enum, importes, moneda y fechas. Un error conserva los valores del formulario.

Los importes de Oportunidades muestran código de moneda y hasta dos decimales. Se corrigió contraste de texto secundario en los tres listados existentes, el fondo en pantallas altas y la legibilidad de controles de fecha. No cambian tokens de planes.

### Matriz de rutas y estado

| Vertical | Destino anónimo | Destino autenticado / catálogo público | Crear / editar | Estado |
| --- | --- | --- | --- | --- |
| Perfiles | /descubre/perfiles | /perfiles | /mi-perfil | Requiere RPC nuevo para listado |
| Talento | /descubre/talento | /talento | /mi-perfil | Vista derivada; requiere el mismo RPC |
| Locaciones | /descubre/locaciones | /locaciones | /mis-locaciones | Catálogo y CMS existentes integrados |
| Oportunidades | /descubre/oportunidades | /oportunidades | /mis-oportunidades | Listado existente; escritura requiere RPC nuevo |
| Learn | /descubre/learn | /cursos | CMS existente | Filtros/listado integrados |

Se conservan /perfiles/[slug], /locaciones/[slug], /oportunidades/[slug] y /cursos/[slug]. Una URL pública directa no redirige a login por ser anónima. Los filtros Casting/Crew/Colaboraciones enlazan al catálogo público; el acceso general anónimo abre la landing. La sesión sólo determina destinos y CTAs, nunca sustituye RLS.

Mi cuenta incluye resumen, perfil, aprendizaje, locaciones, publicaciones, suscripción, ajustes y cierre de sesión. Admin sólo aparece para el rol validado exacto. Publicar incluye perfil, locación y oportunidad. A 1440 px se mantiene la navegación con separadores; Publicar aparece a partir de 1600 px y está disponible en el drawer compacto. Jobs/Marketplace/Tools no se añaden aún al menú porque sus destinos no están entregados.

### Migraciones locales preparadas

1. `supabase/migrations/20260916010000_public_profile_catalog.sql`: proyección pública, filtros y dos índices parciales.
2. `supabase/migrations/20260916020000_opportunity_owner_publishing.sql`: creación/edición atómica por propietario con RLS existente.

Ambas se ejecutaron en PostgreSQL desechable mediante PGlite, junto con las migraciones reales previas de Perfiles y Locations/Opportunities. El harness crea únicamente los prerrequisitos locales de auth y roles. No se aplicaron a ninguna base remota. No hay tabla Jobs ni tabla Tools. No se modifica configuración de Supabase Production.

### Límites funcionales explícitos

El baseline no tiene contacto privado ni postulaciones operativas para estos catálogos. Este checkpoint no inventa un botón de contacto ni revela datos personales para suplirlo. Las landings y el formulario lo indican. Oportunidades permite publicar y consultar convocatorias; no constituye todavía un flujo completo de contratación o postulación. El contacto protegido será una dependencia del siguiente bloque de Servicios y de Jobs, con ownership de emisor/receptor y pruebas de acceso cruzado.

### Validación acumulada

- Billing: 54/54 pruebas existentes.
- Navegación y contenido: 8/8.
- Catálogos, validación y Server Actions: 11/11.
- PostgreSQL/RLS: 6/6 con migraciones reales. Anónimo, propietario, usuario ajeno y admin; exclusión de borradores, proyección pública, filtros/paginación, publicación y rollback atómico.
- Navegador: 18/18 en Chrome, usando exclusivamente transporte Supabase simulado local. Destinos por sesión, teclado/Escape/foco, siete anchos, acceso directo, cero resultados, esquema ausente, fallo, publicados, borradores, creación y conservación de valores tras error.
- TypeScript: correcto. Lint focal del código nuevo: correcto. Lint completo: cero errores y ocho advertencias existentes `no-img-element`.
- Build: correcto con variables locales ficticias y Billing deshabilitado. `git diff --check`: correcto.

Las pruebas de navegador no validan por sí solas RLS: esa comprobación independiente se realiza con PostgreSQL. Aún falta la integración en un Supabase Preview real (PostgREST, Auth y Storage). No se afirma haberla probado ni se usa Production como sustituto.

### Copys e imágenes

El texto final completo está en `content/landings.ts`; el bloque explicativo contextual adicional está en `app/descubre/[vertical]/page.tsx`. Los cinco H1 conservan el brief:

- Perfiles: «Tu trabajo merece una mejor presentación.»
- Talento: «Presencia frente a cámara. Un perfil que la muestre.»
- Locaciones: «El siguiente escenario de tu producción.»
- Oportunidades: «Tu próximo proyecto empieza con una oportunidad.»
- Learn: «Aprende el oficio. Lleva tus ideas al set.»

Home conserva «El ecosistema de la industria audiovisual.» y añade «Orden para crear. Claridad para decidir. Herramientas para producir.» como banda editorial. Business permanece informativo/próximamente.

Fuentes, autores, licencia consultada, fecha, dimensiones, focal point y uso por landing: `content/image-sources.json`. Las fotos son ilustración editorial Pexels, no inventario, miembros ni testimonios. Las capturas de catálogos contienen fixtures identificados como prueba local; no existen en la aplicación ni en bases remotas.

## Siguiente bloque exacto: D — Marketplace / Services

Esta entrega se cierra en A, B para las cinco verticales existentes, y C. Se priorizó completar y verificar estos recorridos. El alcance global del brief continúa pendiente; no se marca Marketplace/Jobs/Tools como disponible.

1. D: migración aditiva Services con propietario, borrador por defecto, publicación/archivo, RLS, campos públicos explícitos y contacto protegido mínimo. Después listado, filtros/paginación, detalle, crear/editar/archivar, landing /descubre/marketplace y navegación. Sin pagos ni transacciones.
2. E: Jobs como subconjunto de Opportunities. Reutilizar compensation_min/max/currency, work_mode, discipline, application_deadline, starts_on/ends_on; añadir sólo semántica/deliverables que falten. Incorporar mecanismo real de contacto/postulación, /jobs y /descubre/jobs. No segunda tabla/motor.
3. F: registro tipado versionado en código para /tools. Writer y Production Assistant sólo landings con estado En desarrollo. Utilities: shutter angle/speed, bitrate/almacenamiento, aspect ratio y crop/focal equivalente, con unidades, supuestos y tests de límites. Ninguna herramienta nueva está disponible en este checkpoint.

## Pasos para un Preview revisable

1. Revisar estos commits en la rama aislada y las dos migraciones. Instalar dependencias con `npm ci`.
2. Provisionar o seleccionar un Supabase exclusivamente de desarrollo/Preview con el esquema base ya validado del proyecto. Aplicar allí, tras revisión, sólo las migraciones pendientes en orden. No ejecutar reset ni migraciones contra Production.
3. Configurar URL y clave pública del entorno aislado en variables de Preview. No copiar secretos Production. Mantener Billing deshabilitado para esta revisión; no modificar su configuración ni Test/Live existentes.
4. Crear usuarios de prueba separados y contenido propio de desarrollo. Comprobar Auth/PostgREST/Storage reales: edición del propietario, denegación cruzada, publicación/archivo, RPC de Perfiles y visibilidad anónima. No cargar fixtures en Production.
5. Ejecutar scripts test:billing, test:navigation, test:catalogs, test:database, test:e2e, TypeScript, lint y build. El script e2e levanta sus propios servidores locales con valores ficticios, sin usar .env Production.
6. Preparar un deploy exclusivamente Preview de esta rama cuando corresponda. En esta ejecución no se hizo push, deploy ni cambio remoto. Las capturas locales permiten revisar ya la composición y los flujos, sin presentar esa prueba como integración remota.
