# Portfolio Editor V1 — revisión

Estado: implementación y QA E2E de Test/Preview completos; listo para revisión de Production. Sin merge, push a main ni deploy Production. Ningún ledger modificado.

1. **Rama/worktree:** `feature/profile-portfolio-editor-v1`, `G:\PROYECTOS\filmatta-profile-portfolio-editor`. Base `e235099fe3e9776440c6183462918d6f4de93d16`.
2. **Preview:** despliegue de revisión Vercel sobre Supabase Test `ezlycwkuzkwcnhrhiruv` y Mux development `kospfo`. URL final en el reporte de entrega. Sin secretos de Production.
3. **Modelo:** `profile_media` pertenece a `professional_profiles`; una entidad común para reel/trabajo/book. Se justifica por lifecycle asíncrono, IDs estables, orden y estados. Preserva los JSONB anteriores e importa una sola vez al activar edición.
4. **Migración:** `20260921010000_profile_media.sql`, aditiva, aplicada exclusivamente en Test. Pendiente de revisión antes de Production. Incluye bucket privado, RLS, RPCs y proyecciones públicas compatibles.
5. **Edición:** diálogos contextuales, alta/metadata/orden persistido con subir-bajar, ocultar, archivar y restaurar. No page builder ni formulario administrativo separado.
6. **Destacados:** un principal por sección, protegido por índice parcial y bloqueo del perfil.
7. **Imagen:** JPG/PNG/WebP, Storage directo; verifica bytes, MIME, extensión, decodificación, límite 40 MP e imagen estática. Original limitado a 20 MB; no se añadió pipeline de derivados.
8. **Embeds:** YouTube/Vimeo canonicalizados, provider/ID, hash privado Vimeo preservado, sin HTML arbitrario. Los enlaces históricos permanecen editables.
9. **Mux:** browser → Direct Upload, policy signed, procedencia de entorno, item/creator metadata, sin pasar video por Vercel ni usar lesson_videos.
10. **Límites:** 5 GB de producto/UI y tamaño declarado validado en servidor; **Mux no impone ese máximo de bytes en su URL**. 20 MB reales para imágenes. Cuotas 10 videos/día y 30/30 días; imágenes 30/día y 100/30 días; dos pendientes por usuario; feature flag.
11. **Reel:** añadir, ordenar, cambiar principal, still elegido entre imágenes propias o thumbnail Mux y archivo lógico.
12. **Talent:** book prioritario, foto principal, mismo editor y modelo de identidad.
13. **Reutilización:** público/edición comparten `ProfilePortfolio` + `PortfolioMedia`; controles y completitud sólo en `/mi-perfil` del owner.
14. **Mobile:** 390 px sin overflow; diálogos desplazables, progreso real y cancelación explícita; sin dependencia de drag. Regresión previa de seis breakpoints 390/768/1024/1280/1440/1920, ocho pruebas de navegador correctas.
15. **Seguridad:** CRUD normal mediante Auth + RLS; anon/non-owner rechazados; drafts privados; proyección sin email/teléfono ni auth metadata. Infraestructura privilegiada sólo para verificación/cleanup/webhook. URLs de imagen 60 s, playback 5 min: tokens ya emitidos no se revocan instantáneamente al ocultar.
16. **Lifecycle:** canonicalización del asset/upload y firma; processing/ready/errored/rejected/deleted; rechazo y borrado seguro de policy pública, pista ausente o master detectado; expiración de intentos 2 h; archivo retiene hasta 30 días y cron de limpieza diario preparado. Endpoint cleanup comprobado con asset real de Test; `CRON_SECRET` pendiente de configuración antes de release.
17. **Capturas:** 22 PNG junto a este reporte; desktop 1440 y mobile 390 para vacío, portfolio, selector, embed, upload imagen/video, progreso real, procesamiento, reordenación, perfil público y book. Fixtures explícitamente ficticios; retrato editorial existente y sample técnico de Mux.
18. **Tests:** 199/199 (Profiles, Talent/catálogos, portfolio, DB/RLS, Auth, Security, Navigation, Billing y Mux). TypeScript/lint focalizado/build/diff correctos. QA real Test: 41 checks, `test-qa.json`, cleanup confirmado. Playback firmado Preview completó el video sin extraer claves. También se verificó entrega real de Mux al Preview con HTTP 200 para asset-created y asset-ready, estado processing → ready y playback firmado completo.
19. **Pendiente/deuda:** Sin bloqueos de QA. Antes de release: revisar la migración y configurar webhook permanente/CRON_SECRET del entorno correcto. Las subidas nuevas quedan pausadas en el Preview de revisión tras retirar el webhook temporal. Contacto operativo, Follow, Boost/Talent+, analytics, reanudación tras cerrar navegador, derivados optimizados de imágenes y actualización de indicadores de catálogo para nuevos uploads quedan fuera del bloque o para seguimiento. No cambiar configuración Production todavía.

## Evidencia visual

- [Portfolio desktop](portfolio-edit-1440.png) / [mobile](portfolio-edit-390.png)
- [Selector desktop](add-work-selector-1440.png) / [mobile](add-work-selector-390.png)
- [Progreso real desktop](video-progress-1440.png) / [mobile](video-progress-390.png)
- [Book desktop](talent-book-1440.png) / [mobile](talent-book-390.png)

## Cierre E2E del Preview

- QA real: `https://app-k7p3jfavl-filmatta.vercel.app` (retirado después de validar, para eliminar sus secretos de runtime).
- Preview limpio de revisión: `https://app-nuo6ym22d-filmatta.vercel.app`.
- Mux Test `kospfo`: credencial dedicada con `system:read`/`system:write`, revocada al terminar. Video read/write usó credenciales Test existentes, verificadas por entorno.
- Login real, upload desde el editor, firma válida/inválida, HTTP 200 del proveedor, idempotencia, processing → ready y reproducción completa comprobados.
- Publicación y regreso a borrador desde UI, lectura anónima sólo pública y rechazo de escritura non-owner comprobados.
- Cuotas diaria/mensual, máximo de dos pendientes, cancelación real de upload abandonado y >5 GB declarado: correctos; `abuse-qa.json`.
- Webhook, bypass, dos variables temporales, asset, usuarios/perfiles y archivo descargado eliminados. Se retiraron los deployments temporales de QA. Protección general conservada.
- Evidencia saneada: `preview-qa.json`. No contiene credenciales ni direcciones con bypass.
- 199/199 pruebas focalizadas y 8/8 de herramientas; TypeScript, lint y build correctos. Un glob inicial incluyó integraciones remotas ajenas que se negaron a ejecutarse por falta de opt-in; no realizaron operaciones. La suite focalizada se volvió a ejecutar completa y pasó.
