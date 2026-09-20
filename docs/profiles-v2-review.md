# Profiles V2 — revisión en curso

Base: origin/main `a2e89353698e1c6ec163f06fddf0a1e9ecf2f985`.
Rama: `feature/profiles-portfolio-polish`. Production queda fuera de esta tarea.

## Diagnóstico comprobado en código

- La limpieza anterior vencía tanto `uploading` como `processing` por reloj, sin consultar Mux, y borraba assets recibidos/huérfanos. La reserva de nuevas cargas repetía ese vencimiento.
- Cerrar una transferencia archivaba el trabajo; no cancelaba la Direct Upload. Un callback tardío podía restaurar su estado.
- El Book se ordenaba antes del Reel en layouts Talent.
- Identidad sólo tenía URL externa de retrato; no uploader ni portada explícita. Créditos sólo título/rol/año.
- Los tokens de video y thumbnail ya tenían audiencias separadas. Un poster gris no demuestra error de firma: falta comprobar HTTP, asset/policy/entorno en Test. La UI ocultaba errores de imagen tras un fallback y no renovaba recursos caducados.

## Checkpoint A — ciclo de cargas

Migración aditiva `20260923010000_profile_upload_lifecycle.sql`: metadata de duración/aspecto verificada por infraestructura, motivo terminal y de revisión; índice de pendientes. Conserva datos, RLS y grants. No reescribe migraciones históricas.

La reconciliación comprueba el upload canónico: asset recibido se sincroniza, un timeout/cancelación confirmado se cierra, waiting se conserva. No inferimos abandono por background. Los eventos tardíos no resucitan intentos terminales. Cancelar consulta de nuevo tras la llamada al proveedor para resolver la carrera con asset_created. Archivar ya no autoriza borrar assets.

El endpoint existente `/api/portfolio/cleanup`, autenticado por CRON_SECRET, ejecuta reconciliación y cuenta huérfanos para revisión. `vercel.json` ya declara la ejecución diaria. No se ha cambiado configuración remota ni confirmado ejecución automática de este código en Preview. No se ejecutará limpieza de datos reales en esta tarea.

Dry-run selectivo en Test: `FILMATTA_RUN_REMOTE_TESTS=ezlycwkuzkwcnhrhiruv node tools/profiles-upload-dry-run.mjs`. Sólo muestra IDs/estados/referencias y propuesta; nunca borra. Revisión humana y autorización separada antes de cualquier eliminación real.

Límite 5 GB: límite de producto/declaración previa con cuotas y pendientes, **no** max-bytes criptográfico de Mux Direct Upload. Un video largo puede estar ready; el límite de reel es otra decisión.

Compatibilidad: aplicar migración antes del nuevo código. Volver al código anterior reintroduciría la limpieza insegura; mantener desactivado su cron durante una reversión. No borrar datos como rollback.

## Validación

En curso. Pruebas locales con PGlite/mocks no equivalen a integración remota. Las cuatro capturas mencionadas no estaban en el adjunto recibido.
