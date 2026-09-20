# Profile Portfolio Editor V1 — auditoría previa

Auditoría histórica anterior a la implementación. El usuario eligió Direct Upload con límite de producto, validación del tamaño declarado y defensas compensatorias. La migración ya se aplicó sólo en Test. El estado vigente y las evidencias están en `profile-portfolio-editor-v1.md` y `review/profile-portfolio-editor-v1/REVIEW.md`; las menciones siguientes a acciones pendientes describen el momento del preflight.

## Base aislada

- Rama: `feature/profile-portfolio-editor-v1`.
- Worktree: `G:\PROYECTOS\filmatta-profile-portfolio-editor`.
- Base tras fetch: `e235099fe3e9776440c6183462918d6f4de93d16` (`origin/main`).
- Sin modificaciones a Production, Supabase Test, Mux, variables de entorno o ledger.

## Modelo existente comprobado

| Elemento | Implementación actual | Consecuencia para V1 |
| --- | --- | --- |
| Identidad | `professional_profiles`, PK `user_id` | Talent conserva la misma identidad y disciplinas. |
| Reels, proyectos y enlaces | `portfolio_items` JSONB; máximo 6; `kind`, `title`, `url`, `summary` | No hay ID por pieza, estado, orden independiente ni procedencia de uploads. |
| Book | `presentation.book`, máximo 6; `url`, `caption` | Mantener datos existentes; añadir capacidad de gestión contextual. |
| Presentación | Retrato, nombre profesional, zona, rango, créditos (máximo 12) | Reutilizar; no crear identidad paralela ni mover créditos a otra tabla. |
| Escritura | RPC `save_my_professional_portfolio`, sesión del owner, sin service role | Mantener Auth y RLS en las operaciones ordinarias. |
| Público | RPCs de proyección con condición `is_public` | Las nuevas lecturas también deben excluir ocultos, archivados y media no lista. |
| Vista compartida | `components/profiles/ProfilePortfolio.tsx` | Usar la misma composición para público y edición con controles contextuales. |
| Mux | Contexto validado por entorno, webhooks firmados y procedencia ligada a `lesson_videos` | Reutilizar conexión/verificación de entorno; separar autorización y lifecycle de portfolio de Learn. |

Migraciones relevantes ya existentes: `20260910120000_create_professional_profiles.sql`, `20260916010000_public_profile_catalog.sql`, `20260920010000_profile_presentation.sql`. No se ha creado ni aplicado una migración nueva.

## Conflicto que requiere decisión

Se exige simultáneamente browser → Mux Direct Upload y un límite real de 5 GB validado antes de autorizar la subida, sin confiar sólo en el tamaño enviado por el navegador.

La [API oficial Create Direct Upload](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload) no documenta una restricción de bytes por upload. El SDK instalado (`@mux/mux-node`, `UploadCreateParams`) expone `cors_origin`, `new_asset_settings`, `test` y `timeout`, sin máximo de bytes. Una validación en servidor de `declared_size` repetiría un dato manipulable por el cliente; no demuestra el tamaño real del archivo que posteriormente recibe Mux.

No confundir `StaticRendition.filesize` con tamaño del archivo original. Tampoco basta un control de resolución, duración o un timeout para garantizar 5 GB.

Opciones enviadas al usuario:

1. Límite estricto mediante almacenamiento temporal con límite verificable, seguido de ingestión en Mux. Requiere cambiar el flujo directo solicitado y verificar las capacidades del proveedor elegido.
2. Mantener Direct Upload aceptando explícitamente que la validación previa comprueba tamaño declarado y no constituye un límite estricto frente a un cliente manipulado.
3. Completar editor, imágenes y embeds, posponiendo uploads de video hasta resolver esta restricción.

Decisión posterior explícita: opción 2. Mantener browser → Mux, registrar `expected_size_bytes`, cuotas por usuario, límite de pendientes, expiración, verificación del lifecycle, rechazo de incoherencias detectables y feature flag. No describir 5 GB como límite estricto impuesto por Mux.

## Propuesta de implementación (todavía no aplicada)

- Entidad aditiva de piezas multimedia vinculada a `professional_profiles`, justificada por IDs estables, edición individual, orden, archivo y lifecycle asíncrono. No es una segunda identidad ni una biblioteca multimedia global.
- Mantener bio, disciplinas, ciudad, disponibilidad, skills, equipo y créditos en el modelo existente. Preservar JSONB histórico mediante importación idempotente y transición explícita de lectura, sin duplicar visualmente piezas ni borrar datos originales.
- Categorías reel/trabajo/book en una arquitectura común. Un destacado principal por categoría, con exclusión atómica y bloqueo por perfil para ordenar concurrentemente sin perder cambios.
- Mutaciones del usuario con cliente normal y autoridad derivada de `auth.uid()`. Los identificadores Mux, procedencia, estado verificado y rutas de archivos no serán campos editables libremente por el cliente.
- RLS owner-only; proyección pública limitada a perfil publicado + pieza visible + no archivada + estado listo. Ninguna proyección incluirá auth metadata, correo o teléfono privados.
- Imágenes en bucket privado específico con límite en Storage de 20 MB, tipos permitidos, rutas propiedad del owner y verificación del contenido recibido. Las URLs públicas permanentes no sirven para imágenes que puedan volver a borrador.
- Mux portfolio con namespace propio y playback firmado; autorización por pieza y estado del perfil antes de emitir tokens de duración acotada. Los enlaces firmados ya emitidos tienen una ventana de validez que debe documentarse al pasar a borrador; no afirmar revocación instantánea.
- Archivo lógico y retención de assets, sin DELETE automático inmediato. Un eventual proceso de limpieza debe volver a comprobar referencias y entorno; no reutilizar el borrado de Learn.
- Modo edición con diálogos por sección, foco accesible, guardar sin recarga completa, estado de publicación visible y actualización inmediata tras respuesta confirmada. Subir/bajar como alternativa al arrastre.
- Progreso obtenido de bytes transferidos; impedir doble envío y pedir confirmación antes de cancelar una transferencia activa.

## Verificación de la base

`npm ci --ignore-scripts`: 388 paquetes instalados; auditoría reportó 0 vulnerabilidades.

Regresión local ejecutada antes de cambios funcionales:

```text
node --test tests/profiles/*.test.mjs tests/catalogs/*.test.mjs tests/auth/*.test.mjs tests/security/*.test.mjs tests/navigation/*.test.mjs tests/billing/*.test.mjs tests/database/*.test.mjs tests/mux/*.test.mjs
185 tests; 185 pass; 0 fail; 0 skipped.
```

Incluye pruebas locales de privacidad/RLS con PGlite y regresiones Auth, Billing, Navigation y Mux. No representa QA remoto de la nueva feature, todavía sin implementar.

Pendientes: decisión sobre uploads de video, implementación, migración aditiva si procede, fixtures Test/Mux Test, Preview, QA autenticado, capturas 1440/390, nuevos tests, TypeScript, lint y build de la feature completa.
