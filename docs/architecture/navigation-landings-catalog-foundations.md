# Navigation + Catalog Foundations — arquitectura de cierre

Estado de cierre: 17 de septiembre de 2026. Rama `feature/navigation-landings-catalog-foundations`, worktree `G:\PROYECTOS\filmatta-navigation-landings`.

## Base y alcance auditados

La base histórica del bloque es `c542b0a7c6e8ecd5ca578c1271819ebed46cfd49`. Al iniciar este cierre, la rama estaba limpia en `ba4d87e9f442e821e1bcfc36f9918a60ae881af3`; main local y la referencia remota consultada ya apuntaban al mismo commit. Este cierre no hizo merge, push ni deploy. Los documentos de QA del 16 de septiembre son evidencia histórica, no un inventario actual de Production.

La autorización de producto adelanta los catálogos y las foundations de Services, Jobs y Tools respecto al backlog original de AGENTS.md. A–F ya estaban implementados: se auditaron y conservaron. Este cierre completa controles de unidades/proporciones en Utilities, recorridos conceptuales de las dos herramientas futuras y documentación. No modifica Billing, Stripe, Mux, grants, entitlements, Auth/SMTP ni las cinco landings iniciales.

## Real / operativo y rutas

| Módulo | Presentación | Producto y reglas |
| --- | --- | --- |
| Perfiles | `/descubre/perfiles` | `/perfiles`, `/perfiles/[slug]`, `/mi-perfil`; RPCs de `professional_profiles`, proyección pública sin identidad privada, disciplina/ciudad/disponibilidad, orden y páginas |
| Talento | `/descubre/talento` | `/talento`, misma tabla, identidad y permisos; Actuación/Modelaje |
| Locaciones | `/descubre/locaciones` | `/locaciones`, detalle y CMS `/mis-locaciones`; conserva fotos, ownership y estados |
| Oportunidades | `/descubre/oportunidades` | `/oportunidades`, detalle y `/mis-oportunidades`; crear/editar/publicar/cerrar/archivar; proyecto mínimo interno |
| Learn | `/descubre/learn` | `/cursos`, detalle, lecciones y cuenta existentes; conserva progreso y acceso |
| Marketplace | `/descubre/marketplace` | `/marketplace`, `/marketplace/[slug]`, `/mis-servicios`, `/mis-servicios/nuevo`, `/mis-servicios/[id]/editar`, `/mis-servicios/consultas` |
| Jobs | `/descubre/jobs` | `/jobs`; detalle `/oportunidades/[slug]`; crear `/mis-oportunidades/nueva?type=job`; CMS compartido |
| Tools | `/tools` | Registry tipado `lib/tools/registry.ts`, sin tabla Supabase; cuatro calculadoras públicas |

Cada catálogo conserva sus reglas públicas por URL directa. Vacío, fallo de transporte y esquema ausente tienen estados distintos. Filtros y paginación se ejecutan en servidor; los formularios validan del lado servidor y SQL vuelve a comprobar ownership y publicación.

## Marketplace y contacto

`service_listings` almacena propietario, slug estable, categoría, descripción, ciudad/modalidad, enlaces HTTPS, precio/moneda opcional, estado y timestamps. No duplica nombre, avatar ni disciplinas del perfil profesional. Catálogo por categoría/ciudad/modalidad, orden estable, paginación, detalle público y CMS de propietario con borrador/publicar/despublicar/archivar.

`catalog_inquiries` es la bandeja protegida compartida con Jobs. Sólo participantes/admin leen sus consultas. El destinatario se deriva en SQL, con FK compuesta al propietario; el emisor necesita perfil profesional publicado. Una consulta por ficha y máximo diez en 24 horas entre ambos módulos. El receptor acepta, declina o archiva; el emisor ve el estado. No se publican teléfono/correo, ni hay chat, email automático o contratación. service_role sólo prepara/limpia fixtures Test y nunca resuelve operaciones de producto.

## Jobs sobre Opportunities

Sólo se añaden `opportunity_type` y `deliverables`. Se reutilizan `compensation_type`, `compensation_min/max/currency`, `discipline`, `work_mode`, `city`, `application_deadline`, `starts_on/ends_on`, propietario, proyecto y estados existentes. No existe tabla ni motor Jobs.

Publicar exige trabajo pagado, importe positivo, moneda, disciplina, brief, entregables y fecha límite. `/jobs` consulta el subconjunto `opportunity_type='job'`. Filtros: disciplina, ciudad/modalidad, moneda e importe mínimo ofrecido, fecha límite. No compara monedas distintas. Contacto y moderación siguen los permisos del sistema compartido.

## Tools y Utilities disponibles

Registro versionado con slug, nombre, categoría, descripción, estado, acceso y ruta. Estados `available`, `beta`, `in-development`; hoy cuatro disponibles y dos en desarrollo.

- `/tools/utilidades/obturacion`: ángulo ↔ exposición por fps de grabación; exposición máxima de un fotograma.
- `/tools/utilidades/almacenamiento`: bitrate en kbps/Mbps/Gbps, minutos y margen; salida adaptativa MB/GB/TB y equivalencia GiB. Base decimal explícita, bits distintos de bytes.
- `/tools/utilidades/relacion-aspecto`: ancho desde alto o alto desde ancho, proporción desde dimensiones; presets 16:9, 9:16, 4:3, 1:1 y 2.39:1, además de valores personalizados.
- `/tools/utilidades/focal-equivalente`: crop conocido o diagonal del área activa frente a full frame 36×24 mm. Equivalencia de encuadre; no cambia focal física ni perspectiva desde la misma posición, ni calcula DoF.

Funciones puras con rangos, unidades, supuestos y rechazo de NaN/Infinity; resultados obsoletos se eliminan al cambiar entradas. No se envían entradas al servidor.

## En desarrollo

`/tools/writer`: landing «Escribe tu historia. Mira más allá de las páginas.»; muestra Guion → Escenas → Personajes → Locaciones → Necesidades de producción, explícitamente conceptual. Orden, claridad, autoría, continuidad y asistencia creativa; sin editor simulado.

`/tools/production-assistant`: landing «De la idea a una producción organizada.»; Idea → Guion → Desglose → Necesidades → Talento / Locaciones / Servicios → Producción. Sin scheduling, presupuestos inteligentes, call sheets ni automatización ofrecidos como disponibles.

## Navegación final

Perfiles ▾ / Oportunidades ▾ / Locaciones / Marketplace / Learn / Tools ▾ / Planes. Separadores decorativos aria-hidden. Perfiles agrupa Profesionales/Talento; Oportunidades agrupa Todas/Jobs/Casting/Crew/Colaboraciones; Tools incluye hub, Writer, Production Assistant y utilidades. Anónimo llega a landings; autenticado a catálogos. Los filtros específicos de oportunidades son públicos.

Mi cuenta: resumen, perfil, aprendizaje, locaciones, publicaciones, servicios, consultas, suscripción y ajustes; cerrar sesión y Admin según rol validado. Publicar enlaza a formularios existentes de perfil/locación/oportunidad/job/servicio. Desktop desde 1440 px; drawer jerárquico por debajo. Click/teclado/Escape/foco y cierre al navegar verificados. Ningún middleware nuevo privatiza catálogos.

## Migraciones y estado remoto

Supabase de validación exclusivo: `ezlycwkuzkwcnhrhiruv`. Las cuatro migraciones ya estaban registradas; se verificaron y NO se reaplicaron durante este cierre:

1. `20260916010000_public_profile_catalog.sql`: RPC público e índices; requiere Professional Profiles.
2. `20260916020000_opportunity_owner_publishing.sql`: RPC propietario; requiere foundations Projects/Opportunities.
3. `20260916030000_services_directory.sql`: Services e inbox; requiere Auth, Profiles, `private.is_admin()` y triggers foundation.
4. `20260916040000_jobs_specialization.sql`: requiere Opportunities y migraciones 2 y 3.

Auth/PostgREST/RLS/RPCs reales aprobados con anon, owner, no-owner y admin; fixtures eliminados. Evidencia actual: [closure-test-evidence.json](../review/closure-test-evidence.json). Evidencia de aplicación histórica y grafo detallado: [checkpoints D–F](../review/checkpoints-d-f.md) y [Preview previo](../review/remote-preview.md).

**Production `ihryubbegljbwmuyazbn` no fue consultada ni modificada en este cierre. No se puede certificar que las cuatro migraciones sigan pendientes allí basándose en informes históricos, especialmente porque main ya contiene el bloque.** No se crearon migraciones nuevas en este cierre. En Test no quedan pendientes. Antes de un rollout autorizado, verificar historial Production y aplicar sólo las ausentes, en el orden anterior; nunca ejecutar reset ni duplicar registros de historial.

## Validación y revisión visual

[Cierre reproducible, resultados y capturas](../review/closure.md). Pruebas de fórmulas/catálogos/permisos, Billing, lint, TypeScript, build optimizado local y navegador. El build usa sólo la configuración pública Test, sin Billing habilitado. Chrome comprueba 360/390/768/1024/1280/1440/1920 px. Las capturas de fichas corresponden a fixtures temporales identificados, no inventario real.

Copy de verticales: `content/landings.ts`; herramientas futuras: `components/tools/ProductVision.tsx`. Fuentes de fotos, autor, licencia, dimensiones y crops: `content/image-sources.json`. No se añadieron imágenes en este cierre ni se inventaron usuarios, vendors o testimonios.

## Pasos posteriores de despliegue (no ejecutados)

1. Revisar los commits de cierre frente a main actual. No reincorporar D–F como si faltaran: ya estaban en `ba4d87e`.
2. Preparar un nuevo Preview del commit aprobado, con URL/clave pública exclusivamente Test y Billing deshabilitado; conservar las reglas de protección Vercel. El Preview histórico no contiene los ajustes de este cierre.
3. Repetir `playwright.preview.config.mjs` sobre la URL exacta autorizada, usando acceso temporal sin registrar tokens; limpiar fixtures y revocar acceso QA al terminar.
4. Sólo con autorización posterior, auditar historial y dependencias Production. Aplicar únicamente SQL faltante; los ajustes de este cierre no requieren SQL. Desplegar el commit aprobado y hacer smoke de rutas/roles, sin pagos como parte de este bloque.
5. Si el smoke falla, volver al deployment anterior; las migraciones son aditivas y no deben eliminarse para revertir el frontend.

## Deuda y futuro

Reviews, matching, pagos Marketplace, mapa/geografía, Projects/Production completo, Writer real, Production Assistant real y Tools avanzadas siguen en backlog. Sin DoF, hiperfocal ni electricidad/seguridad. Services/Jobs tienen consulta inicial, no mensajería completa ni notificaciones. Falta UI administrativa específica de moderación; RLS admin sí existe. Jobs mantiene una disciplina textual y no archiva automáticamente al vencer. Ocho advertencias históricas de `<img>` siguen sin errores de lint. Matriz actual Chrome/Windows; Safari/Firefox y auditoría externa de accesibilidad pendientes. Recuperación portable y SMTP pertenecen a la rama separada `codex/recovery-callback` y no se integraron aquí.
