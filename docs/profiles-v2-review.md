# Profiles V2 — revisión en curso

Base: origin/main `a2e89353698e1c6ec163f06fddf0a1e9ecf2f985`.
Rama: `feature/profiles-portfolio-polish`. Production queda fuera de esta tarea.

## Diagnóstico comprobado en código

- La limpieza anterior vencía tanto `uploading` como `processing` por reloj, sin consultar Mux, y borraba assets recibidos/huérfanos. La reserva de nuevas cargas repetía ese vencimiento.
- Cerrar una transferencia archivaba el trabajo; no cancelaba la Direct Upload. Un callback tardío podía restaurar su estado.
- El Book se ordenaba antes del Reel en layouts Talent.
- Identidad sólo tenía URL externa de retrato; no uploader ni portada explícita. Créditos sólo título/rol/año.
- Los tokens de video y thumbnail ya tenían audiencias separadas. Un poster gris no demuestra error de firma: falta comprobar HTTP, asset/policy/entorno en Test. La UI ocultaba errores de imagen tras un fallback y no renovaba recursos caducados. En Preview se comprobó además que el poster firmado carga (1920×1080) pero el botón completo heredaba background opaco del editor y lo tapaba. Se corrige el overlay transparente sin cambiar la firma/política.

## Checkpoint A — ciclo de cargas

Migración aditiva `20260923010000_profile_upload_lifecycle.sql`: metadata de duración/aspecto verificada por infraestructura, motivo terminal y de revisión; índice de pendientes. Conserva datos, RLS y grants. No reescribe migraciones históricas.

La reconciliación comprueba el upload canónico: asset recibido se sincroniza, un timeout/cancelación confirmado se cierra, waiting se conserva. No inferimos abandono por background. Los eventos tardíos no resucitan intentos terminales. Cancelar consulta de nuevo tras la llamada al proveedor para resolver la carrera con asset_created. Archivar ya no autoriza borrar assets.

El endpoint existente `/api/portfolio/cleanup`, autenticado por CRON_SECRET, ejecuta reconciliación y cuenta huérfanos para revisión. `vercel.json` ya declara la ejecución diaria. No se ha cambiado configuración remota ni confirmado ejecución automática de este código en Preview. No se ejecutará limpieza de datos reales en esta tarea.

Dry-run selectivo en Test: `FILMATTA_RUN_REMOTE_TESTS=ezlycwkuzkwcnhrhiruv node tools/profiles-upload-dry-run.mjs`. Sólo muestra IDs/estados/referencias y propuesta; nunca borra. Revisión humana y autorización separada antes de cualquier eliminación real.

Límite 5 GB: límite de producto/declaración previa con cuotas y pendientes, **no** max-bytes criptográfico de Mux Direct Upload. Un video largo puede estar ready; el límite de reel es otra decisión.

Compatibilidad: aplicar migración antes del nuevo código. Volver al código anterior reintroduciría la limpieza insegura; mantener desactivado su cron durante una reversión. No borrar datos como rollback.

## Implementación

- Sobre mí visible primero; Reel → Otros videos → Book → Trayectoria. Sidebar alineado con navegación mediante grid; disponibilidad/contacto compactos en móvil. Un único nombre profesional, sin segundo alias visible ni completitud pública. Catálogo usa retrato almacenado cuando existe.
- Un reel video principal; nuevas selecciones requieren duración Mux real >0 y <=180 s. 179.9/180 permitidos; >180 permanece en Otros videos. Reel histórico no se cambia silenciosamente. Fuentes externas sin metadata verificada pueden ser Otros videos. Orientación audiovisual/fotográfica explícita: publicar fotografías no exige reel.
- Foto/portada: Storage privado, autorización owner, validación de bytes/tipo/dimensiones (64px mínimo, 20MB, 40MP, JPG/PNG/WebP estático), crop/foco/zoom, derivados WEBP sin EXIF, referencias sustituidas sólo después de validar. Los originales nuevos no se publican. No se descargan URLs arbitrarias. URLs históricas se conservan hasta edición explícita. Book mixto con lightbox, flechas y Escape.
- Tarifa estructurada opcional: importe/moneda/hora o día. Texto histórico conservado sin asumir unidad. No conecta con cobros.
- Preferencias separadas y privadas; default sin especificar; formatos no implican participación. No son consentimiento ni certificación.
- Mi cuenta → Información personal → Datos de contacto: Instagram canónico y WhatsApp E164; display derivado mediante libphonenumber-js (única dependencia nueva). Número nacional requiere país; confirmación de formato antes de guardar. No hay verificación de propiedad ni envíos a WhatsApp/Instagram. El contacto interno existente no comparte estos campos.
- Datos privados en tabla owner-only; sin grants a administradores/anon por comodidad, sin payload público/SEO/catálogos. Visibilidad sólo private; se documentan members_only/public/consent_required como posibilidades futuras, sin habilitarlas.
- Bio determinista en cliente/servidor/trigger: handles y contacto inequívoco bloqueados. Email permitido con aviso; URLs profesionales y referencias a publicaciones de Instagram permitidas. No es detector absoluto, no OCR ni IA. Un email que el usuario conserva en Bio **sigue siendo público**. Bios históricas sin cambios no bloquean otras ediciones ni se reescriben. Borrador en memoria de la sesión de edición.
- Trayectoria amplía los mismos créditos: rol, productora, tipo, año/mes parcial, en curso, descripción/enlace; orden estable reciente primero. No inventa continuidad ni verificación.

## Migraciones, en este orden

1. `20260923010000_profile_upload_lifecycle.sql`: duración/aspecto, razones terminal/revisión, índice pendiente, reconciliación conservadora.
2. `20260923020000_profile_reel_selection.sql`: selección verificada de reel, bloqueo de perfil padre y reemplazo atómico.
3. `20260923030000_profile_identity_images_rates.sql`: propósito de imagen, derivados/crop, referencias de identidad, tarifa/orientación; permisos de Storage y proyecciones explícitas.
4. `20260923040000_private_profile_contact_bio.sql`: contactos owner-only y trigger de Bio sin revalidación histórica destructiva.
5. `20260923050000_profile_preferences_credits.sql`: preferencias privadas, validadores y extensión de créditos existente.
6. `20260923060000_profile_media_attestation_grant.sql`: EXECUTE para service_role sólo sobre validador puro de crop; requerido por CHECK al atestar imágenes reales. No concede CRUD adicional.
7. `20260923070000_profile_bio_professional_references.sql`: acota detección para distinguir referencia a publicación de enlace a perfil/contacto.

Las siete se aplicaron únicamente a `ezlycwkuzkwcnhrhiruv`, con RLS activo y recuentos pre/post sin pérdida de registros. Se registraron sólo estas versiones nuevas en Test, sin reconciliar historial ajeno. Ninguna migración fue reescrita tras aplicarse. Production `ihryubbegljbwmuyazbn` no recibió escrituras.

## Validación local y Test

- 231 pruebas de Profiles/Portfolio/Contactos/Auth-MFA/Billing/Navigation/Mux-Learn/DB/Security/Catálogos pasaron, más prueba posterior de carrera cancelación/asset_created y dos pestañas. Son pruebas locales; mocks y PGlite no se presentan como integración remota.
- TypeScript, lint focalizado, build optimizado y diff-check correctos.
- Test real: login de fixture por contraseña, publicación/despublicación, imagen con bytes reales y EXIF eliminado, sustitución UI válida y sustitución inválida que conserva retrato; RLS owner/non-owner/anon, Storage overwrite ajeno rechazado, contactos y preferencias privados, visibilidad forjada rechazada. Guardado UI de contacto normalizado, preferencia, alta/edición/eliminación CV; 34 casos Bio por RPC.
- Direct Upload real a Mux Test con clip oficial pequeño, asset ready y duración real 16 s, selección de reel, cancelación waiting y declaración >5GB rechazada. Webhooks firmados de QA recibidos en localhost y duplicados idempotentes, comprobando estado canónico real de Mux. **Esto no equivale a entrega del proveedor al Preview.**
- Limpieza integrada con Supabase/Storage reales, limitada a IDs/owners de fixtures: límite de dos pendientes, original ausente vence, original recibido se conserva para finalización explícita y ready sobrevive a segunda reconciliación. Dos filas y archivos transitorios retirados. No se probó un cron programado remoto ni se habilitó en Production.
- Playwright local: 360/390/768/1280/1440 px, perfiles público/owner; sólo fotos, catálogos y landings en 390/1440. Viewports emulados, no dispositivo físico. Capturas en `docs/review/profiles-v2`. Los contactos privados no aparecen en capturas.
- Las cuatro capturas de referencia mencionadas no estaban en el adjunto recibido: comparación basada en las instrucciones y diseño actual.

## Demo y verificación pendiente en Preview

Fixtures exclusivamente Test, rotulados como ficticios: Cine (reel, otros videos, Book, CV), Book (sólo fotos), Incompleto (borrador). Se conservan intencionalmente para revisión. No son perfiles de personas reales. No se tocó el perfil de Alain. Imágenes editoriales ya presentes en el manifiesto del repositorio; sin nuevas fuentes de stock.

Se creó un único clip QA `test:true` después de comprobar que los assets existentes de Test tenían políticas incompatibles (pública/mixta). No se copiaron videos Production ni se cambiaron políticas ajenas. El manifiesto local temporal conserva sólo IDs; credenciales en memoria. La limpieza completa verifica qa_run, owner y passthrough antes de retirar exclusivamente estos fixtures; jamás assets reutilizados.

Pendiente antes de cerrar: Preview Ready con configuración Test existente, poster firmado y **reproducción real con avance temporal**, revisión visual allí. Los secretos de firma Preview existentes son sensibles/no extraíbles; no se copian a archivos locales ni se crea otra credencial. Capturas locales del reel muestran de forma explícita la falta de esa configuración local; no se presenta como fallo de firma demostrado en Production.

## Rollout posterior (no ejecutado)

1. Revisar diff y siete migraciones; comprobar base de main y consumidores compartidos.
2. Respaldo/preflight de schema, grants, RLS, funciones, índices, datos e identidad de entorno.
3. Aplicar exclusivamente las siete migraciones en orden, tras autorización separada Production.
4. Deploy compatible con schema y secretos server-side existentes; no tocar Billing/Auth/MFA ni Mux Learn.
5. Verificar CRON_SECRET y ejecución del cron diario ya definido; la definición no demuestra que el scheduler haya corrido. En Preview no se afirma cron automático activo.
6. Smoke real de Auth+RLS, imágenes, reel/poster/reproducción, publicación, contactos, preferencias y CV.
7. Revisar dry-run de uploads históricos con estado local/remoto, referencias y propuesta.
8. Toda limpieza de datos/assets reales requiere autorización separada. Assets listos/compartidos/huérfanos no se borran automáticamente.

Reversión: conservar datos nuevos y desactivar el antiguo limpiador antes de volver a código previo, pues éste vuelve a borrar por tiempo. No hacer down destructivo de columnas/tabla como rollback. Leer esquema nuevo desde código previo requiere revisar proyecciones y compatibilidad; mantener las defensas de privacidad del schema.

Deuda posterior: ejecución remota del cron a comprobar en rollout; revisión manual de huérfanos/derivados fallidos inciertos; duración de fuentes externas sin atestación; política general de email voluntario en Bio pendiente; compartir contactos por consentimiento, matching y preferencias públicas no implementados. Follow y Boost/Talent+ siguen fuera de scope.
