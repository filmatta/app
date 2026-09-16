# Preview remoto — FILMATTA ecosystem

Fecha: 16 de septiembre de 2026. Rama: `feature/navigation-landings-catalog-foundations`.

Preview: https://app-21491pa08-filmatta.vercel.app

Deployment: `dpl_7JVnJdTqq55AZgWTtxHH21dfnjah`, estado Ready, entorno Preview del proyecto existente `filmatta/app`. Conserva la protección de Vercel: para la revisión humana hay que entrar con una cuenta autorizada del equipo. La prueba automatizada utilizó un enlace temporal restringido a este deployment, sin desactivar la protección del proyecto. Ese enlace de QA fue revocado al finalizar.

La aplicación desplegada corresponde a `6fb7f171ee92e94c525c34215c183a169d8565fa`. En esta sesión sólo se añadieron pruebas y evidencia; no hubo cambios en código de producto, SQL ni Billing. El despliegue contenía además el informe de auditoría de esquema, sin diferencias de aplicación. Los commits de QA posteriores documentan esta misma aplicación.

## 1. Aislamiento y configuración

- Supabase exclusivo de Test: `ezlycwkuzkwcnhrhiruv`. URL pública del Preview verificada contra ese proyecto; Auth y PostgREST reales comprobados con fixtures.
- El proyecto prohibido `ihryubbegljbwmuyazbn` no se consultó ni modificó.
- Se heredaron las variables públicas Preview verificadas. Las credenciales sensibles Preview de Vercel no son exportables: sólo devuelve marcadores `[SENSITIVE]`.
- Por ello, en este deployment exclusivamente se fijaron `BILLING_ENABLED=false`, `BILLING_MODE=test` y valores vacíos para `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY`, `MUX_PRIVATE_KEY` y `MUX_WEBHOOK_SECRET`, tanto en build como runtime. No se editaron variables compartidas, Production ni callbacks.
- Billing está desactivado en este Preview. Sus pantallas se probaron en modo no transaccional; no se intentó checkout, portal Stripe, pago ni playback Mux. La suite Billing verifica su lógica existente; esto no constituye una nueva certificación de pagos o reproducción remota.
- La clave administrativa Test sólo se utilizó desde el ejecutor local para crear/eliminar usuarios sintéticos. Las fichas, escrituras de negocio y pruebas de permisos utilizaron sesiones normales de usuario. No se concedieron permisos adicionales.

## 2. Migraciones y dependencias reales

Las cuatro migraciones ya estaban aplicadas en Test antes de esta sesión. Se comprobaron historial, tablas, funciones y policies; no había pendientes y no se ejecutó ninguna migración de nuevo. Historial e inventario completos: [evidencia SQL](remote-preview-database.json).

| Orden válido | Migración nueva respecto de main | Dependencias reales | Resultado |
| --- | --- | --- | --- |
| 1 | `20260916010000_public_profile_catalog.sql` | `professional_profiles` de `20260910120000_create_professional_profiles.sql`, incluyendo `display_name`, `disciplines`, `is_public`, `updated_at`; roles `anon/authenticated` | RPC público de proyección segura e índices de catálogo presentes |
| 2 | `20260916020000_opportunity_owner_publishing.sql` | `projects`, `opportunities`, constraints, triggers y RLS de `20260910230000_create_locations_opportunities_foundations.sql`; `auth.uid()` | `save_my_opportunity(uuid,jsonb,text,text)` presente |
| 3 | `20260916030000_services_directory.sql` | `auth.users/auth.uid()`, `professional_profiles`, `private.is_admin()`, `private.set_vertical_foundation_timestamps()` y `private.set_vertical_publication_timestamp()` | `service_listings`, `catalog_inquiries`, RPCs, constraints y policies presentes |
| 4 | `20260916040000_jobs_specialization.sql` | Foundation de Opportunities; contrato `save_my_opportunity` de 2; `catalog_inquiries`, `service_listings` y contrato `list_my_catalog_inquiries` de 3; `professional_profiles` | Columnas/constraint/índice Jobs e inbox compartido presentes |

`private.is_admin()` pertenece al esquema base existente documentado en `supabase/production/0001_core_learn_prerequisites.sql`. Los dos triggers privados de timestamps/publicación proceden de la foundation del 10 de septiembre. Ese archivo de prerequisitos no se ejecutó en ningún entorno durante esta tarea.

El grafo no depende sólo de los timestamps: 1 es independiente de 2 y 3; 3 no requiere el RPC de 2; 4 sí debe ir después de 2 y 3. Los prerequisitos del esquema base deben existir primero.

**Lista exacta para un futuro rollout Production:** las cuatro migraciones anteriores, desde `supabase/migrations/`, en el orden de la tabla. Son las únicas nuevas en esta rama. Antes de aquel rollout habrá que comprobar allí el historial y los prerequisitos; esta tarea no inspeccionó ni certifica el estado actual de Production. No ejecutar ciegamente otra vez migraciones ya registradas.

## 3. Navegación y rutas

Anónimo: principales entradas editoriales `/descubre/perfiles`, `/descubre/talento`, `/descubre/locaciones`, `/descubre/oportunidades`, `/descubre/learn`, `/descubre/marketplace`, `/descubre/jobs`. Autenticado: destinos a `/perfiles`, `/talento`, `/locaciones`, `/oportunidades`, `/cursos`, `/marketplace`, `/jobs`. Casting/Crew/Colaboraciones acceden directamente a sus filtros públicos. Cambiar el destino del menú no privatiza el catálogo.

Desktop: separadores `/` decorativos, Perfiles y Oportunidades agrupados, Tools, Planes, login/logout y Mi cuenta. El header pasa a drawer por debajo de 1440 px. Click, Enter, Escape, devolución de foco y cierre al navegar verificados. El usuario normal no ve Admin y `/admin` rechaza su sesión; el admin real sí accede.

Rutas recorridas en Preview:

- `/` y las siete landings `/descubre/*` indicadas.
- Los seis catálogos Perfiles, Talento, Locaciones, Oportunidades, Marketplace y Jobs; `/cursos`.
- Detalles reales publicados y borradores mediante `/perfiles/[slug]`, `/locaciones/[slug]`, `/oportunidades/[slug]`, `/marketplace/[slug]`.
- `/tools`, `/tools/writer`, `/tools/production-assistant`, `/tools/utilidades` y sus cuatro calculadoras.
- `/mi-perfil`, `/mis-locaciones/[id]/editar`, `/mis-servicios/nuevo`, `/mis-servicios/[id]/editar`, `/mis-servicios/consultas`, `/mis-oportunidades/nueva?type=job`, `/mis-oportunidades/[id]/editar`.
- `/planes`, `/cuenta/suscripcion`, `/billing/return`, anónimo y/o autenticado según su regla de acceso. Se comprobó contenido/redirect esperado, no sólo HTTP 200.

## 4. Catálogos, Marketplace y Jobs

Inventario visual temporal: tres perfiles públicos (uno de Actuación), un perfil privado; dos locaciones publicadas con fotografía editorial y una privada; Casting, Crew y Colaboración; dos Jobs publicados y borradores; tres servicios y un borrador. Todos identificados como QA, sin datos personales reales. Una prueba adicional de paginación utilizó 26 servicios efímeros en una ciudad de QA separada.

- Perfiles usa proyección pública sin correo ni nombre privado; Talento deriva de las disciplinas de la misma identidad. Perfil del propietario editado desde el Preview.
- Locaciones conserva su CMS, fotografías y permisos. Edición real desde móvil; escritura cruzada y escritura anónima rechazadas para locaciones y fotos.
- Marketplace: listado, filtro de categoría/ciudad, detalle, crear, editar, publicar, volver a borrador, republicar y archivar comprobados. Consulta privada entre cuentas, respuesta del destinatario y exclusión de un tercero verificadas. No hay checkout, escrow, pagos ni transacciones entre participantes.
- Jobs consulta únicamente `opportunities` con `opportunity_type='job'` y semántica pagada; no existe tabla `jobs`. Casting/Crew/Colaboraciones no aparecieron en ese catálogo. Presupuesto/moneda, fechas, entregables, filtro de moneda y detalle reutilizado comprobados. El contacto utiliza el inbox compartido. Cerrar el Job retira su detalle público.
- Borradores ocultos por URL directa y por consultas de la base. No se simularon respuestas del servidor ni se usó service role para conseguir lecturas o escrituras de catálogo.
- Paginación: enlaces de retorno con filtros en los seis catálogos, resultados vacíos; recorrido real 24 + 2 servicios, sin duplicados y con orden estable al volver. Límite y frontera de la RPC de perfiles comprobados en PostgreSQL desechable.

## 5. Tools y cálculos

Registro tipado en código. Cuatro utilidades disponibles; Writer y Production Assistant continúan **En desarrollo**, con landings honestas. Sin tabla de Tools ni aplicaciones simuladas.

Casos adicionales comprobados por fórmula y en el Preview:

| Entrada | Resultado |
| --- | --- |
| 25 fps, 90° | 1/100 s; 10 ms |
| 50 Mbps, 10 min, margen 20% | 3.75 GB sin margen; 4.5 GB con margen |
| Ancho 1080, proporción 9:16 | 1080 × 1920 px |
| Focal 35 mm, crop 2× | Equivalente 70 mm; focal física sigue en 35 mm |

Se comprobó además error visible para exposición mayor que un fotograma. Las suites de fórmula cubren límites, unidades, cero/no finitos y equivalencia por diagonal. No se equipara crop con perspectiva ni profundidad de campo.

## 6. Verificación visual y pruebas

Chrome contra la URL remota. Home, diez landings/puntos de entrada y seis catálogos poblados: 1440/360/390/768 px; Tools, sus entradas y calculadoras también 1024/1280/1920 px. 67 capturas completas desktop/mobile en [índice visual](remote-preview-screenshots.md), inspeccionadas como imágenes, incluyendo formularios, cards, crops, jerarquía, ancho de texto, estados vacíos y resultados. No se observaron overflow horizontal, solapes bloqueantes ni imágenes rotas en los casos revisados.

| Verificación | Resultado |
| --- | --- |
| Billing | 54 pass |
| Navegación/contenido | 8 pass |
| Catálogos/validación/acciones | 14 pass |
| PostgreSQL desechable/RLS | 9 pass |
| Tools | 7 pass (6 existentes + caso adicional) |
| Integración Auth/PostgREST Test | 3 suites pass |
| Navegador en Preview remoto | 5 escenarios pass; incluye matrices de rutas/anchos y permisos |
| TypeScript | `tsc --noEmit` pass; build también comprueba tipos |
| Lint completo | 0 errores; 8 avisos existentes sobre `<img>` |
| Build local Test y build Vercel | Correctos |
| Diff whitespace | `git diff --check` correcto |

Evidencia: [regresión inicial](remote-preview-regression.txt), [build](remote-preview-build.txt), [lint](remote-preview-lint.txt). El caso unitario adicional de Tools pasó por separado. Los escenarios de navegador se ejecutaron en grupos y se repitió únicamente el ciclo de servicio al añadir despublicación/republicación, y la comprobación de paginación al incorporarla.

Hallazgos corregidos en QA: selectores ambiguos contra `main` durante streaming y `role=alert` del anunciador interno de Next; comparación de objetos entre contextos del ejecutor de fórmulas; captura de inbox adelantada al contenido. Se esperan los elementos reales antes de capturar. No fue necesaria ninguna corrección visual o funcional de producto en esta sesión.

## 7. Limpieza, diff y límites de entrega

Los fixtures se eliminan en `finally` al borrar sólo los usuarios generados por cada ejecución; sus registros dependientes se eliminan por FK. No se subieron archivos a Storage: las fotos QA apuntaban al asset editorial local del Preview. Conteos finales: [cleanup](remote-preview-cleanup.json). No se eliminaron tablas, policies ni migraciones.

Main y origin/main permanecen en `c542b0a7c6e8ecd5ca578c1271819ebed46cfd49`. El checkout original conserva sus cambios anteriores. No hubo merge, push ni despliegue Production. [Preflight y archivos protegidos](remote-preview-preflight.json); [inventario completo del diff](remote-preview-diff.txt).

Billing, Stripe, webhooks, grants, entitlements, Mux y los permisos administrativos existentes no recibieron cambios de código en esta tarea. Las rutas protegidas de Billing/Mux se compararon contra main sin diferencias. No se incorporó `codex/live-smoke-discount`, no se tocaron cupones ni se realizaron pagos.

El Preview queda revisable con cuenta Vercel autorizada y con catálogos vacíos cuando no haya contenido Test propio, porque las fichas de QA se eliminan. Las capturas preservan la revisión con contenido. Activar servicios externos o planificar el rollout Production es una tarea posterior; no es necesario para revisar navegación, landings, catálogos, CMS y utilidades en este Preview.
