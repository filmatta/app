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
