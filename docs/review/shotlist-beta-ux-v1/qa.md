# Shotlist Beta UX V1 — cierre de implementación y QA

Base: `origin/staging` en `a634ae0de1935f9c39a09119be673a3f320d95ed`.

Rama dedicada: `codex/shotlist-beta-ux-v1`.

## Qué existía antes

- Modelo persistente real de Shotlist: shotlists, grupos/escenas y planos, con RLS, RPCs idempotentes y propiedad por usuario.
- Edición de filas e inspector, selección, reordenamiento, duplicación, borrado protegido por dependencias de Storyboard y exportación CSV básica.
- Vínculo Writer → Shotlist, Storyboard derivado de los planos y consumo de Shotlist por Production.
- `@react-pdf/renderer` ya estaba instalado; no existía soporte XLS.
- Asistido compartía la ruta generativa y podía inventar cobertura; Importar abandonaba Shotlist; Nueva escena usaba `prompt`; no había menubar ni filtros por columna.

La auditoría completa y la matriz previa están en `audit.md`.

## Qué cambió

- Grid tabular de escenas y planos con columnas configurables, inserciones contextuales, búsqueda, filtros combinables, filas navegables con teclado e inspector.
- Menubar Archivo / Editar / Formato / Ayuda y menús `⋮` de grupo/fila.
- Badges/dropdowns accesibles para Tipología, Óptica, Ángulo, Movimiento, Soporte y Estado; focales canónicas más valor personalizado.
- Popup FILMATTA para escena manual, sin escribir en Writer.
- Importación dentro de Shotlist desde Writer o desde `.csv`/`.xls`, con límites, preview, selección de hoja, mapeo explícito, rechazo de mapeos duplicados e idempotencia.
- Contrato de modos: Libre es manual; Asistido sólo aplica información explícita/determinista ya disponible y declara `IA: 0 llamadas`; únicamente Sugerido puede solicitar propuestas nuevas mediante una acción explícita.
- Estado real Crear/Abrir Storyboard derivado de paneles existentes; crear el espacio no genera imágenes.
- Exportación CSV por alcance/columnas y PDF tabular A3/A4 horizontal, multipágina, con encabezados repetidos y texto envuelto.
- Render progresivo por lotes para grids grandes y alternativa visible a hover en viewport táctil.

## Campos

Existían y se reutilizaron: `shotType`, `composition`, `subject`, `angle`, `movement`, `support`, `lens`, `setup`, `durationSeconds`, `status`, `description`, `intention`, `notes`, IDs/posición, procedencia y vínculos de fuente/asset.

Sólo se expusieron o derivaron: Locación e INT/EXT desde el título canónico del grupo/escena; Plano desde el orden visible; Tipología desde `shotType`; Óptica desde `lens`; Observaciones desde `notes`.

No se añadió ningún campo persistente ni migración. `Tiempo`, `Cro` y `GEAR` permanecen sin inventar. `Setup`, Plano/Tipología y el significado de Tiempo requieren definición de producto antes de cambiar contratos.

## QA ejecutado

| Bloque | Resultado |
| --- | --- |
| Interacción Shotlist desktop | PASS: teclado, filtros, dropdown persistente, menubar, nueva escena, CSV/XLS preview + mapping y export dialog |
| Interacción sin hover | PASS: inserción visible y persistida en viewport 390 × 844 |
| Writer smoke + Writer → Shotlist | PASS: Writer abre, presenta la Shotlist vinculada y navega a la superficie real |
| Storyboard smoke | PASS: abre el tablero derivado de la Shotlist fixture |
| Production smoke | PASS: abre la superficie aprobada sin alterar fuentes |
| E2E específico | 3/3 PASS |
| Tests Shotlist | 10/10 PASS |
| Writer completo | 345/345 PASS |
| Storyboard | 11/11 PASS |
| Production | 7/7 PASS |
| TypeScript | PASS (`tsc --noEmit`) |
| ESLint dirigido | PASS sin warnings |
| ESLint completo | PASS, 0 errores; conserva 14 warnings previos fuera de alcance |
| Build Next.js | PASS, 58 páginas estáticas y rutas dinámicas compiladas |
| `git diff --check` | PASS |
| PDF | PASS: 7 páginas A3 horizontal, inspección visual de todas las páginas, encabezados repetidos y filas sin corte |

`npm audit --omit=dev` reporta una vulnerabilidad alta preexistente en `source-map-js@1.2.1`, transitiva de Next/PostCSS/Tailwind. La nueva dependencia oficial SheetJS `xlsx@0.20.3` no aparece en el reporte. No se aplicó `npm audit fix` por estar fuera del alcance y poder alterar el lockfile ampliamente.

## Evidencias

- `output/screenshots/shotlist-beta-ux-v1/01-grid-filtro-activo.png`
- `output/screenshots/shotlist-beta-ux-v1/02-menubar-grid-inspector.png`
- `output/screenshots/shotlist-beta-ux-v1/03-popup-nueva-escena.png`
- `output/screenshots/shotlist-beta-ux-v1/04-popup-importar-sin-salir.png`
- `output/screenshots/shotlist-beta-ux-v1/05-mobile-insercion-sin-hover.png`
- `output/pdf/filmatta-shotlist-beta-ux-example.pdf` — 7 páginas, SHA-256 `48E489AFC9225914D0FC297BDEDA4D1BCBA90DF4E95486F42FEED6E9F8E6E31E`

## Límites y confirmaciones

- No se cambió schema ni se creó migración.
- No se ejecutó IA real: 0 llamadas.
- No se escribió en Supabase remoto ni Production real; todo el QA interactivo usó un fixture local.
- No se modificó Writer, Storyboard ni Production salvo el contrato/test de integración estrictamente necesario; sus superficies pasan smoke/regresión.
- No se promovió nada a `staging` ni se tocó `main`.
- El ZIP `filmatta_shotlist_beta_ux_v1.zip` y sus cuatro capturas no estuvieron disponibles en Descargas, workspace ni adjuntos visibles. Por tanto, la implementación respeta `WORK.md`, pero la comparación final contra esas referencias y las instrucciones contenidas en sus nombres queda pendiente hasta que el paquete sea adjuntado.
