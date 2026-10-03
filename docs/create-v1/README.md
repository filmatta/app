# FILMATTA CREATE V1

Entrega visual y de producto de la Home, navegación y dashboard de FILMATTA CREATE. La rama parte exactamente de `050013a43e8991a6cdfc412e8ebd698b90e38c58` (`codex/writer-breakdown-shotlist-v1`). No incluye cambios de schema, permisos, entitlements, precios, pagos ni lógica interna de Writer/Shotlist.

## Verdad de producto

- Writer: disponible; la Home usa una captura del componente real con datos sintéticos.
- Shotlist: beta; la Home usa una captura del componente real con datos sintéticos.
- Storyboard y Sketcher: conceptos en desarrollo, identificados dentro de cada composición.
- Production: concepto en desarrollo; sus controles son únicamente parte del visual.
- REC: dirección futura; no se afirma app nativa, cámara u operación offline.
- Learn: enlaza sólo al catálogo publicado existente.

El catálogo canónico de presentación está en `lib/create/catalog.ts`. Disponibilidad, visibilidad por superficie, destino y tipo de visual son campos independientes. Las rutas y RLS siguen siendo la autoridad para acceso.

## Evidencia visual

- `source/`: capturas originales, sin barra del navegador, de Writer y Shotlist reales.
- `derived/`: composiciones y recortes WebP reproducibles mediante `node tools/derive-create-v1-assets.mjs`.
- `qa/`: Home completa y acercamientos en 1920, 1440, 834, 768 y 390 px, además del dashboard de usuario nuevo.
- `components/create/ProductVisuals.tsx`: fuentes editables HTML/CSS/SVG de Storyboard, Sketcher, Production, REC y del hero conectado.
- `manifest.json`: procedencia, estado, viewport y transformaciones.

Todos los nombres, IDs, escenas y documentos de las capturas son sintéticos. La revisión no contiene correo, contraseña, token, datos de pago, URL compartible ni obra privada.

## Navegación y superficies legacy

Profiles/Talent, Locations, Opportunities, Services y Business se retiraron únicamente de Home, navbar principal, dashboard y Crear. Sus rutas, páginas, APIs, componentes, SEO, datos y controles de acceso no se eliminaron ni redirigieron.

El dashboard consulta sólo `writer_scripts` y `writer_shotlists` del propietario autenticado y etiqueta la fecha como “Editado”. Si una consulta falla, conserva acceso a las herramientas y muestra un estado parcial sin inventar progreso ni último acceso.

## Rollback

En `lib/create/experience.ts`, cambiar `PUBLIC_HOME_VARIANT` de `"create"` a `"legacy"`. La Home anterior permanece en `app/page.tsx`; no existe una ruta pública `/old-home`. El rollback no modifica datos, rutas, permisos ni el dashboard.

## QA

- Matriz Home: 1920×1080, 1440×1000, 834×1112, 768×1024 y 390×844.
- Overflow horizontal: 0 en todos los anchos registrados en `qa/capture-report.json`.
- Estados de dashboard cubiertos por pruebas: vacío, guiones/shotlists propios, mezcla reciente y fallo parcial.
- Pruebas de catálogo/navegación comprueban que los conceptos futuros no aparecen en Crear y que las verticales marketplace no aparecen en superficies principales.
- La captura es emulación de viewport en Chrome/Playwright, no prueba en dispositivo físico.

## Despliegue

Este paquete no cambia `main`, staging ni Production. Un Preview remoto y su Shareable Link deben crearse desde el SHA final si hay credenciales Vercel autorizadas; las capturas de esta carpeta corresponden a la revisión local aislada.
