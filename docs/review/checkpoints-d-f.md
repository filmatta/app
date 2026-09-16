# Checkpoints D–F — continuación

Rama y worktree existentes: feature/navigation-landings-catalog-foundations, G:\PROYECTOS\filmatta-navigation-landings. Base aprobada d5f8e07. No se rehacen A–C.

## Gate A: Supabase Test real

Destino comprobado mediante CLI y configuración Test: ezlycwkuzkwcnhrhiruv. Production ihryubbegljbwmuyazbn excluido del ejecutor. No se copiaron secretos Production.

Aplicadas el 2026-09-16 UTC, cada una dentro de transacción junto con su registro de historial:

- 20260916010000_public_profile_catalog.sql
- 20260916020000_opportunity_owner_publishing.sql

Prueba real Auth/PostgREST aprobada: tests/integration/previous-catalogs.test.mjs. Tres usuarios temporales creados, sesiones obtenidas mediante Auth, pruebas con anon/owner/non-owner/admin y limpieza completada. service_role sólo prepara/limpia usuarios; el rol admin de prueba se asigna por SQL restringido al UUID y email generado, sin conceder nuevos grants a service_role. Todas las operaciones funcionales se prueban con clave pública y sesiones normales.

Verificado: perfiles públicos solamente, proyección sin identidad privada, filtros, detalle por slug, exclusión de perfil privado, crear/editar/publicar/cerrar/archivar oportunidades, slugs estables, relación real PostgREST con proyecto, restricciones de importes y rechazo de escrituras cruzadas.

Auditoría SQL: RLS activo en professional_profiles/projects/opportunities; anon puede ejecutar catálogo pero no escritura; authenticated puede escribir; save_my_opportunity conserva SECURITY INVOKER.

El primer intento de preparar el admin con service_role fue denegado por grants existentes. Se respetó la denegación y se cambió únicamente la preparación del fixture a SQL administrativo. Las dos migraciones se aplicaron sin fallos; no hubo que corregirlas ni reinicializar Test. La revisión automática rechazó inicialmente la ejecución por la restricción antigua; autorizó el mismo comando al contrastar la autorización expresa del nuevo brief.

Reproducción: definir FILMATTA_RUN_REMOTE_TESTS con el ref Test y FILMATTA_TEST_ENV_FILE con la ruta a la configuración Test existente; ejecutar node --test tests/integration/previous-catalogs.test.mjs. El helper valida ambos refs y rechaza claves JWT de otro proyecto. No registrar secretos en informes.

## Checkpoint D — Services

Implementado: /descubre/marketplace, /marketplace, /marketplace/[slug], /mis-servicios, /mis-servicios/nuevo, /mis-servicios/[id]/editar y /mis-servicios/consultas. Menú público/autenticado y Mis servicios habilitados. Mantiene el lenguaje visual; la landing usa un mapa editorial de especialidades sin proveedores ficticios ni nuevas fotografías innecesarias.

Modelo aditivo service_listings: propietario Auth, identidad/slug inmutables, datos profesionales no duplicados, enlaces HTTPS estructurados, precio/moneda opcionales coherentes, borrador por defecto, publicar/despublicar/archivar y timestamps derivados. Índices de catálogo/categoría/propietario, constraints y RLS explícitos. Anónimo sólo puede seleccionar columnas públicas de fichas publicadas; admin puede moderar mediante políticas existentes.

Contacto mínimo real: catalog_inquiries, privado para participantes/admin, destinatario derivado en SQL y protegido con FK compuesta al propietario. Requiere perfil profesional público del emisor; una consulta por ficha y hasta diez en 24 horas, serializadas por emisor. El receptor acepta, declina o archiva; el emisor consulta estado. No hay chat, correo, pago ni contrato automático. Al despublicar se oculta el título nuevo de la ficha a emisores anteriores. La bandeja deja preparado un segundo tipo de destino por FK para Jobs, sin duplicar mensajería.

Migración 20260916030000_services_directory.sql validada desde PostgreSQL limpio (PGlite) y aplicada exclusivamente en Test con historial transaccional. Test real Auth/PostgREST aprobado, incluyendo ciclo de estados, owner/non-owner/admin, columnas públicas, rechazo de enlaces inseguros y privacidad de consultas. TypeScript, lint focal y tests de navegación/formulario/RLS correctos. Capturas y smoke de navegador completos se incluyen en la validación final inferior.

## Checkpoint E — Jobs sobre Opportunities

/descubre/jobs y /jobs habilitados; detalle compartido /oportunidades/[slug], creación /mis-oportunidades/nueva?type=job y CMS existente. Sólo añade opportunity_type y deliverables; reutiliza compensación, moneda, disciplina, modalidad, fechas y proyecto mínimo. Publicación de Job exige pago positivo, moneda, disciplina, brief, entregables y fecha límite. No existe tabla Jobs ni un segundo motor.

Filtros por disciplina, ciudad, modalidad, moneda, importe mínimo ofrecido y cierre desde una fecha; orden estable y paginación. Importe sólo filtra con moneda explícita, sin conversiones. Contacto comparte catalog_inquiries, con destino exclusivo por FK compuesta al propietario; requiere perfil público y plazo vigente. Mismo límite de diez consultas en 24 horas entre Services y Jobs. Las consultas anteriores conservan estado privado cuando se cierra o archiva una publicación.

Migración 20260916040000_jobs_specialization.sql aplicada exclusivamente en Test, tras validación limpia en PGlite. Pruebas reales Jobs y regresión Services aprobadas (dos suites): anon/owner/no-owner/admin/tercero, presupuesto, entregables, fechas, duplicados, consulta privada, cierre y archivo. Fixtures eliminados al terminar. Tests locales: 14 catálogo/formulario, 8 RLS, 8 navegación. TypeScript y lint focal aprobados al cierre.

## Checkpoint F — Tools y utilidades

Registro tipado lib/tools/registry.ts, versionado en código. Sin tabla Tools. /tools presenta estados reales; /tools/writer y /tools/production-assistant son landings de visión en desarrollo, con alcance explícito. /tools/utilidades contiene cuatro calculadoras públicas: /obturacion, /almacenamiento, /relacion-aspecto, /focal-equivalente.

Funciones puras, unidades, rangos, supuestos y resultados con precisión limitada sólo en presentación. Obturación admite conversión en ambos sentidos y prohíbe exposición mayor que un fotograma; almacenamiento separa bits/bytes, GB/GiB y margen elegido; aspecto usa píxeles cuadrados y redondeo visible sin prometer compatibilidad de códec; equivalencia focal usa full frame 36×24 mm y explicita diagonal, aspecto, perspectiva y ausencia de cálculo de profundidad de campo. Fuentes técnicas enlazadas en cada utilidad: RED, IEC y Nikon. FOV avanzado, DoF, hiperfocal y electricidad/seguridad siguen pendientes.

Seis tests de fórmulas/registro aprobados, incluyendo valores no finitos, cero, negativos, bordes y conversiones inversas. Dos pruebas de navegador de interacción y estado aprobadas. TypeScript, lint focal y diff --check correctos. La fotografía existente de cottonbro studio se reutiliza en Production Assistant y queda registrada en content/image-sources.json. No se descargaron imágenes nuevas ni se simulan usuarios o proveedores.

## Entrega y commits

Rama: feature/navigation-landings-catalog-foundations. Worktree: G:\PROYECTOS\filmatta-navigation-landings. Main y origin/main permanecen en c542b0a7c6e8ecd5ca578c1271819ebed46cfd49. El checkout de main permanece limpio y los cambios locales ajenos del checkout original se conservaron.

| Commit | Entrega |
| --- | --- |
| 8193537 | Gate real de las dos migraciones previas en Supabase Test |
| 349243e | D: Services, directorio y consultas privadas |
| b8e6660 | E: Jobs sobre Opportunities, sin motor paralelo |
| 3855445 | F: registro Tools, landings y cuatro utilidades |
| Commit de revisión posterior | Ajustes visuales focalizados, smoke del build, capturas y este informe |

No se modificaron archivos de Billing, Stripe, grants, entitlements, webhooks, autorización Mux ni configuración Production. Sin push, merge, despliegue, pagos o cambios de variables Vercel. El manifiesto del Home se conserva.

## Validación final

| Comprobación | Resultado |
| --- | --- |
| Suite Billing existente | 54/54 aprobados |
| Navegación y destinos | 8/8 aprobados |
| Catálogos, filtros, paginación y formularios | 14/14 aprobados |
| SQL/RLS desde base limpia PGlite | 9/9 aprobados; incluye límite diario compartido y denegación de INSERT directo |
| Fórmulas y registro Tools | 6/6 aprobados |
| Navegador con transporte local | 20/20 aprobados (18 regresión + 2 Tools; dos selectores de las pruebas nuevas se corrigieron y repitieron) |
| Auth/PostgREST reales en Test | 3/3 suites: catálogos previos, Services y Jobs; la suite previa se repitió tras extender Opportunities |
| Navegador contra Test real | 2/2 sobre build optimizado: 70 combinaciones ruta/tamaño + flujo propietario/contacto/no autorizado/admin |
| TypeScript | Sin errores |
| ESLint completo | Sin errores; 8 advertencias preexistentes de img en Learn/Locaciones/Admin/Cuenta |
| Build optimizado Next.js | Aprobado, ejecutado localmente con configuración pública Test y Billing deshabilitado |
| git diff --check | Sin errores |

El smoke del build cubre crear servicio en borrador, acceso público denegado al borrador, publicar, filtrar, detalle por URL directa, rechazo de editor ajeno, enviar consulta privada, aceptar interés y ocultarla a un tercero. También publica un Job mediante el formulario compartido, verifica presupuesto y entregables, envía interés desde móvil, cierra el Job y archiva el servicio. Admin se valida mediante sesión Auth real y rol del servidor. Las sesiones de navegador usan tokens legítimos de Auth obtenidos por el helper, no tokens inventados. Los fixtures se eliminan al terminar.

Evidencia del destino, historial y RLS: [test-database-evidence.json](test-database-evidence.json). El helper administrativo se limita a preparar y eliminar usuarios sintéticos; ninguna operación funcional o UI usa service_role.

## Revisión visual

Revisados 360, 390, 768, 1024, 1280, 1440 y 1920 px sin overflow horizontal. Capturas desktop 1440 y móvil 390 inspeccionadas visualmente para Marketplace, Jobs, Tools, Writer, Production Assistant y Utilities; también se revisaron calculadoras y bandeja privada. Se ajustaron acentos lila/slate y la carga eager del hero de Production Assistant. No se rediseñaron las cinco landings aprobadas; sus capturas de regresión sólo reflejan el menú ampliado.

Las 27 capturas nuevas proceden del build optimizado local conectado a Test. Las fichas con la leyenda «prueba aislada» corresponden exclusivamente a fixtures temporales eliminados, no a inventario ni miembros reales.

[Índice completo de capturas](screenshots-d-f.md)

## Migraciones y Preview

Aplicadas y validadas en Test ezlycwkuzkwcnhrhiruv:

- 20260916010000_public_profile_catalog.sql (previa).
- 20260916020000_opportunity_owner_publishing.sql (previa).
- 20260916030000_services_directory.sql (nueva D).
- 20260916040000_jobs_specialization.sql (nueva E).

Ninguna fue ejecutada en Production por esta tarea. Las dos nuevas siguen pendientes de rollout Production y requieren las dos previas y las foundations originales. No ejecutar una migración aislada saltándose dependencias. En Test no queda ninguna migración de este bloque pendiente.

Para un Preview compartible: publicar esta rama aislada cuando corresponda, crear el Preview con la URL/clave pública del proyecto Test y Billing deshabilitado, configurar su URL de retorno de Auth en Test si hace falta y repetir el smoke sobre esa URL. No copiar claves Production. No hay Preview remoto desplegado por esta ejecución.

Reproducir navegador Test: configurar FILMATTA_RUN_REMOTE_TESTS=ezlycwkuzkwcnhrhiruv y FILMATTA_TEST_ENV_FILE apuntando a la configuración Test local. Ejecutar npx playwright test --config playwright.remote.config.mjs. Con build local previo, FILMATTA_TEST_BUILD=true ejecuta next start. Nunca guardar tokens o archivos de sesión en Git.

## Límites y siguiente iteración

- Services es directorio con consulta inicial y respuesta de interés; no es chat bidireccional, mensajería por email, contratación ni marketplace transaccional. Una consulta por ficha y diez en 24 horas entre ambos módulos. Siguiente bloque de contacto: conversaciones/notificaciones y herramientas de abuso, con autorización de producto propia.
- Moderación admin se sostiene en RLS existente y permisos explícitos. No se añadió una consola específica de moderación de Services o Jobs.
- Jobs usa una disciplina textual existente. El presupuesto es orientativo y no convierte divisas. Un plazo vencido bloquea nuevos contactos, pero no archiva automáticamente la ficha; el propietario puede cerrar o archivar.
- Writer y Production Assistant sólo presentan la visión en desarrollo. Sin editor, autosave, importación, exportación, IA, scheduling ni call sheets funcionales.
- Utilidades limitadas a las cuatro publicadas. Sin cálculo de profundidad de campo, FOV avanzado, hiperfocal ni electricidad/seguridad. Las notas de cada cálculo delimitan su uso.
- Las pruebas visuales automatizadas usan Chrome en Windows; no se declara una matriz Safari/Firefox ni una auditoría externa de accesibilidad. Se verificaron teclado, foco, Escape, drawer y tamaños indicados.
- No se ha probado un flujo de pago Live: sólo se ejecutó la suite Billing existente. No se tocaron Production ni sus servicios.
