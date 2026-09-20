# Portfolio Editor V1 + Media Blocks

## Producto

`/mi-perfil` comparte `ProfilePortfolio` y `PortfolioMedia` con `/perfiles/[slug]`. El owner activa edición y abre diálogos por sección. Guarda sin recarga completa, mueve piezas arriba/abajo, destaca una por sección, oculta, archiva y restaura. El layout pertenece a FILMATTA. No hay identidad adicional de Talent ni page builder.

Los cambios guardados de un perfil público se ven inmediatamente. Un borrador sigue privado. Los controles y completitud sólo se muestran al owner en `/mi-perfil`.

## Datos y migración

`20260921010000_profile_media.sql` es aditiva: añade `professional_profiles.media_initialized`, la tabla `profile_media`, RPCs de edición/proyección y el bucket privado `profile-media`. No modifica Auth, Billing ni `lesson_videos`.

La primera edición importa enlaces/reels/book bajo bloqueo del perfil. Conserva el JSONB histórico para recuperación y usa IDs estables para las piezas. Las lecturas públicas antiguas también proyectan sólo las piezas visibles tras la importación; no revelan el JSON histórico cuando una pieza se oculta o archiva.

RLS mantiene lectura propia en tabla. Create/edit/reorder/feature/archive usan sesión normal y `auth.uid()`. Los campos de lifecycle, URLs de Storage y procedencia Mux no se aceptan como metadata editable. Sólo la comprobación de imágenes, el webhook firmado y la limpieza usan un cliente privilegiado de infraestructura. No hay service role en cliente, ni bypass de Auth/RLS por query string.

Una pieza es reel/trabajo/book y puede ser imagen, video externo o video Mux. Los enlaces históricos se conservan. Los nuevos embeds se limitan a YouTube/Vimeo y se canonicalizan, incluido el hash privado de Vimeo. Nunca se almacena HTML de embed.

## Límites de producto y abuso

| Control | V1 |
| --- | --- |
| Video | 5,000,000,000 bytes declarados; MP4/MOV; cliente y backend |
| Imagen | 20,000,000 bytes reales; JPG/PNG/WebP; bucket + comprobación del archivo recibido |
| Decodificación de imagen | Imagen estática, hasta 40 megapíxeles; coincidencia MIME/formato y tamaño declarado/recibido |
| Pendientes | 2 uploads por perfil, incluyendo imágenes |
| Video | 10 reservas en 24 h; 30 en 30 días |
| Imágenes | 30 reservas en 24 h; 100 en 30 días |
| Portfolio | 100 piezas no archivadas |
| Destacados | 1 por sección: reel, trabajo y book |
| Direct Upload URL | Expira en 1 hora |
| Intento abandonado | Error/cleanup después de 2 horas |
| Archivo lógico | Oculto inmediatamente; retención de hasta 30 días |

**5 GB no es un hard limit de bytes impuesto por la URL de Mux.** El servidor valida una declaración y la guarda como `expected_size_bytes`. Un cliente modificado podría mentir. Se limita exposición mediante reservas serializadas, cuotas, pendientes, expiración y `PORTFOLIO_DIRECT_UPLOADS_ENABLED=true`. Cualquier otro valor pausa nuevas autorizaciones de video. Archivar o fallar no borra el historial que cuenta para cuotas.

El archivo de video va del navegador a Mux. No pasa por Vercel. El progreso usa eventos reales de bytes transferidos. Durante la transferencia se bloquea el cierre accidental del diálogo y se ofrece cancelación explícita. Después de transferir, el procesamiento puede continuar con el diálogo cerrado.

Mux no documenta el tamaño original como prueba suficiente en los datos usados aquí. `StaticRendition.filesize` mide un derivado y no sirve para comprobar los 5 GB originales. Sí se rechazan evidencia de ProRes/uncompressed, ausencia de pista de video y playback inesperadamente público; tras marcar `rejected` se elimina únicamente el asset cuya procedencia se comprobó.

## Lifecycle y privacidad de assets

Namespace `filmatta:portfolio:<item UUID>`, metadata `external_id` y `creator_id` derivados del servidor, vinculación a upload ID y environment. El webhook verifica firma, límite de body, entorno esperado y el estado canónico de Mux. Eventos duplicados/tardíos no deben regresar un asset listo a un estado viejo. Una carrera con el binding devuelve error reintentable.

Todo playback Mux usa policy `signed`. `/api/portfolio/media/[id]/resource` verifica owner o perfil público + pieza visible + ready antes de emitir tokens de 5 minutos. Imágenes reciben URLs firmadas de 60 segundos. No hay URLs públicas permanentes para archivos propios. Al pasar a borrador se rechazan nuevas emisiones inmediatamente; los tokens ya emitidos pueden seguir válidos hasta su expiración. No se promete revocación instantánea.

Los embeds externos y los enlaces externos históricos dependen también de la privacidad del proveedor original: FILMATTA no puede revocar una URL pública de YouTube/Vimeo o una imagen alojada fuera de su Storage.

`/api/portfolio/cleanup` requiere `CRON_SECRET`, comprueba entorno y asociación antes de borrar assets y permite reintento. El cron de Vercel está preparado para ejecución diaria. Los cron de Vercel no se ejecutan automáticamente en Preview: ejecutar esta ruta de forma autenticada en QA y configurar el secreto antes de cualquier release Production. No se ha desplegado este cambio en Production.

## Configuración necesaria por entorno

- Supabase URL/public key y service role del mismo proyecto. Service role permanece sólo en runtime de servidor para rate limits existentes e infraestructura de media.
- `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_EXPECTED_ENVIRONMENT_ID`, `MUX_EXPECTED_ENVIRONMENT_TYPE` con procedencia comprobada. Preview debe ser development/Test.
- `MUX_SIGNING_KEY`, `MUX_PRIVATE_KEY` sólo server-side para reproducción firmada.
- Webhook específico a `/api/portfolio/mux-webhook`, con `MUX_PORTFOLIO_WEBHOOK_SECRET` server-side. No reutilizar autorización premium de Learn.
- `PORTFOLIO_DIRECT_UPLOADS_ENABLED` y `CRON_SECRET`.

La protección de Vercel Preview puede impedir entregas externas de Mux. No desactivar protección general ni reutilizar tokens existentes sin autorización. La validación de entrega directa al Preview requiere una ruta autorizada para ese webhook.

## Evidencias y alcance de QA

`tools/portfolio-qa.mjs` crea usuarios temporales sólo en Supabase Test, usa login real por UI, crea uploads Test y limpia usuarios, objetos Storage y assets propios al finalizar. Credenciales se mantienen en memoria. La entrega local de webhook usada por esta suite está firmada por el fixture y consulta el asset real en Mux; **no equivale a confirmar entrega del proveedor al Preview**.

Capturas y reporte: `docs/review/profile-portfolio-editor-v1/`. Las personas/medios de fixtures son material de prueba, no usuarios reales. Se reutilizan assets editoriales existentes y un sample técnico de Mux.

Reproducción firmada verificada visualmente en Preview: el sample técnico llegó a 0:16 / 0:16. No se extrajeron claves privadas. El fixture y su asset fueron eliminados. QA remoto: 41 comprobaciones y 22 capturas; incluye limpieza real de un asset archivado. Regresiones: 199 tests, TypeScript, lint focalizado y build correctos.

QA Mux → Preview protegido completado: Direct Upload real desde UI, eventos `video.upload.asset_created`, `video.asset.created` y `video.asset.ready` con HTTP 200, firma inválida rechazada, repetición idempotente y estado processing → ready. Playback firmado completo y publicación/borrador mediante Auth + RLS normales.

Todos los recursos temporales se retiraron: webhook, bypass, variables, credencial dedicada, archivo descargado, assets, usuarios y deployments de QA. El Preview limpio mantiene nuevas subidas directas pausadas porque el webhook temporal ya no existe; imágenes y embeds siguen disponibles. Antes de activar Direct Upload en release hay que configurar su webhook permanente y secreto de cleanup. Production permanece intacto.

## Fuera de alcance

Follow, contacto operativo, Boost/Talent+, analytics, comentarios, reviews, temas, constructor libre y biblioteca global. Las URLs externas históricas se mantienen compatibles. No hay staged publishing ni reanudación de transferencia después de cerrar el navegador.
