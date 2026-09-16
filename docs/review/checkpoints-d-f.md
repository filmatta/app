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

Migración 20260916030000_services_directory.sql validada desde PostgreSQL limpio (PGlite) y aplicada exclusivamente en Test con historial transaccional. Test real Auth/PostgREST aprobado, incluyendo ciclo de estados, owner/non-owner/admin, columnas públicas, rechazo de enlaces inseguros y privacidad de consultas. TypeScript, lint focal y tests de navegación/formulario/RLS correctos. Capturas y smoke de navegador completos se añadirán al cierre D–F.

## Checkpoint E — Jobs sobre Opportunities

/descubre/jobs y /jobs habilitados; detalle compartido /oportunidades/[slug], creación /mis-oportunidades/nueva?type=job y CMS existente. Sólo añade opportunity_type y deliverables; reutiliza compensación, moneda, disciplina, modalidad, fechas y proyecto mínimo. Publicación de Job exige pago positivo, moneda, disciplina, brief, entregables y fecha límite. No existe tabla Jobs ni un segundo motor.

Filtros por disciplina, ciudad, modalidad, moneda, importe mínimo ofrecido y cierre desde una fecha; orden estable y paginación. Importe sólo filtra con moneda explícita, sin conversiones. Contacto comparte catalog_inquiries, con destino exclusivo por FK compuesta al propietario; requiere perfil público y plazo vigente. Mismo límite de diez consultas en 24 horas entre Services y Jobs. Las consultas anteriores conservan estado privado cuando se cierra o archiva una publicación.

Migración 20260916040000_jobs_specialization.sql aplicada exclusivamente en Test, tras validación limpia en PGlite. Pruebas reales Jobs y regresión Services aprobadas (dos suites): anon/owner/no-owner/admin/tercero, presupuesto, entregables, fechas, duplicados, consulta privada, cierre y archivo. Fixtures eliminados al terminar. Tests locales: 14 catálogo/formulario, 8 RLS, 8 navegación. TypeScript y lint focal aprobados al cierre.
