# Security V1 — runbook de release Production

Este documento prepara el release; no autoriza ni ejecuta Production.

## Before migration

1. Congelar el candidato exacto y guardar `origin/main`, HEAD, diff y resultados.
2. Confirmar backup/restore de base y capturar `pg_get_functiondef(private.is_admin)`.
3. Confirmar que las tablas y owner columns requeridas siguen presentes y que no
   existen objetos `security_publication_quota` de una ejecución parcial.
4. Confirmar variables Production: Supabase Production, secreto para HMAC de rate
   limit, Mux expected environment production y credenciales del mismo environment.
   No imprimir valores.
5. Tener abierta una sesión operativa Supabase y el deployment anterior listo para
   rollback. El admin Production actual no tiene factor verificado.

## Orden exacto

1. Aplicar sólo `20260918020000_abuse_controls.sql`. Es transaccional y habilita
   el RPC que el nuevo login necesita. Verificar tablas, grants y cuatro triggers.
2. Desplegar el candidato aprobado. Verificar usuario normal, login y recovery
   genérico; no ejecutar pagos.
3. Iniciar sesión como admin: password debe llevar a `/verificar-admin`. Enrollar
   TOTP, guardar recuperación operativa fuera de la aplicación y completar AAL2.
   Verificar acceso a `/admin` y una lectura administrativa no destructiva.
4. Aplicar `20260918010000_admin_mfa.sql`. Verificar que la definición contiene
   `auth.jwt()->>'aal' = 'aal2'` y que las 17 policies siguen presentes.
5. Abrir una sesión admin nueva: AAL1 denegado, challenge TOTP, AAL2 permitido.
   Confirmar lectura de cursos y acceso Storage previsto sin hacer cambios.
6. Ejecutar smoke de rutas públicas, headers/cookies, Auth budgets, una publicación
   QA controlada y su limpieza. Observar errores 401/403/429/5xx y latencia.
7. Registrar manualmente ambas migraciones y evidencias, porque Production no tiene
   historial `supabase_migrations.schema_migrations` disponible.

No invertir 1 y 2: el código nuevo falla cerrado si falta el RPC de rate limit. No
aplicar MFA antes de disponer del código/enrollment salvo que se acepte una ventana
sin administración.

## After migration

- `private.is_admin()` exige role admin + AAL2.
- `consume_auth_rate_limit` sólo es ejecutable por `service_role`.
- Las tablas privadas no son accesibles por anon/authenticated.
- Los cuatro triggers están activos y los límites siguen en 50 create/20 publish
  por recurso/usuario/24 h.
- Admin AAL1, non-admin AAL2 y factor revocado quedan denegados; admin AAL2 funciona.
- Login/signup/recovery normal funcionan sin enumeración; un usuario no consume la
  quota de otro; retry de entidad no cuenta doble.
- Webhook Mux inválido/sobredimensionado se rechaza; environment guard permanece.
- CSP no produce violaciones legítimas en Auth, navegación, planes o reproducción.

## Rollback / recovery

1. Si el código falla antes de MFA, volver al deployment anterior. La migración de
   abuso puede permanecer: no requiere el código y sus límites son conservadores.
2. Si Auth se bloquea por el RPC, volver primero al deployment anterior; después,
   en transacción, eliminar los cuatro triggers, la función de trigger, la función
   pública y finalmente las tres tablas privadas. Esto elimina sólo contadores,
   configuración y ledger, nunca filas de catálogo. No retirar DB mientras el
   código nuevo siga activo porque Auth falla cerrado.
3. Si MFA bloquea administración, mantener el código nuevo y recuperar/eliminar el
   factor mediante el procedimiento administrativo de Supabase, luego enrollar uno
   nuevo. No cambiar password esperando elevar AAL.
4. Si se necesita rollback urgente completo de MFA, volver al deployment anterior
   y restaurar en transacción la definición capturada de `private.is_admin()` basada
   sólo en rol. Esto reduce seguridad y exige incidente, ventana breve y reaplicación.
5. Tras cualquier rollback, repetir las consultas de función/policies/triggers,
   verificar login normal y admin, y documentar los objetos que quedaron activos.

La reversión de MFA no requiere restaurar datos. La reversión de abuso pierde sólo
estado de rate/quota; por eso debe conservarse evidencia antes de eliminarlo.
