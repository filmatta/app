# Shotlist Beta UX V1 — auditoría previa

Base auditada: `origin/staging` en `a634ae0de1935f9c39a09119be673a3f320d95ed`.

Esta auditoría es deliberadamente acotada al modelo y las superficies que consume Shotlist. No cambia schema, permisos, Writer, Storyboard ni Production.

## Estado anterior

- Shotlist ya es una superficie funcional con grupos vinculados o manuales, filas editables, inspector, selección múltiple, reordenamiento, duplicación y borrado protegido cuando existen paneles de Storyboard.
- La persistencia usa `writer_shotlists`, `writer_shotlist_groups` y `writer_shotlist_shots`, con RLS de lectura por propietario y mutaciones validadas en rutas de servidor/RPC.
- Writer crea Shotlists de forma idempotente desde IDs canónicos de escena; Shotlist conserva `scriptId`, `sourceSceneId`, `sourceBlockId` y revisión de fuente.
- Storyboard es una vista derivada de Shotlist. La existencia real se determina por paneles en `storyboard_panels`; no existe una entidad Board separada.
- Production conserva una referencia blanda a Shotlist y actualmente consume grupo, tipo de plano, sujeto, duración, posición y revisión. `duration_seconds` se presenta allí como duración en pantalla.
- CSV ya exporta el conjunto completo, conserva acentos/BOM, escapa comillas y neutraliza fórmulas de hoja de cálculo.
- `@react-pdf/renderer` ya está instalado. No existe parser XLS/XLSX en las dependencias actuales; `jszip` no es un lector XLS binario.
- El grid actual no está virtualizado; renderiza todas las filas expandidas. Storyboard sí pagina visualmente en lotes de 120.
- La interfaz actual navega a `/writer?shotlistImport=1` para importar, usa `window.prompt` para crear escena y no tiene menubar Shotlist.
- Los menús de Writer ofrecen un patrón reutilizable de teclado, Escape, click fuera y retorno de foco, sin que sea necesario modificar Writer.

## Matriz de columnas

| Solicitado | Campo/derivación real | Estado previo | Persistencia | Decisión V1 |
| --- | --- | --- | --- | --- |
| Tiempo | Ninguno inequívoco | Falta/indefinido | — | No identificar con duración, horario ni preparación. Mantener `Duración (s)` por separado. |
| Locación | Encabezado/título del grupo; `sceneLocationLabel()` puede derivar locación de un encabezado Writer | Oculto como dato separado | Derivado de fuente; título del grupo persistente | Exponer la derivación sin escribir de vuelta a Writer. Sin override persistente nuevo. |
| Cro | Ninguno | Falta/indefinido | — | No crear ni adivinar. |
| INT / EXT | Encabezado/título de escena | Oculto como dato separado | Derivado de fuente o título manual | Exponer derivación cuando el encabezado sea reconocible; vacío cuando no exista evidencia. |
| Plano | Numeración visible calculada por orden | Visible como `#` | Identidad por UUID; orden por `position` | Etiquetar la numeración como Plano sin convertirla en ID editable. Ratificación semántica pendiente. |
| Descripción | `description`; el grid usa `subject` como acción breve | Inspector | Persistente | Exponer ambas sin concatenarlas: Acción y Descripción. |
| Óptica | `lens` | Visible como Lente | Persistente | Reutilizar `lens`; normalizar solamente para filtro/presentación. |
| Tipología | `shotType` es el tipo/tamaño de plano actual | Visible como Plano/Tipo de plano | Persistente | Exponer como Tipología, conservando valores existentes. Relación exacta Plano/Tipología queda documentada. |
| Ángulo | `angle` | Visible | Persistente | Conservar contrato y mejorar editor visual. |
| Movimiento | `movement` | Visible | Persistente | Conservar contrato y mejorar editor visual. |
| GEAR | Ninguno inequívoco. `support` describe soporte y no equivale a equipo general | `support` sólo en CSV | Persistente sólo para soporte | Exponer Soporte sin renombrarlo a GEAR. GEAR persistente requeriría schema y autorización. |
| Observaciones | `notes` | Inspector como Notas | Persistente | Etiqueta visible Observaciones, sin duplicar campo. |

Columnas existentes que se preservan aunque no formen parte de la lista solicitada: Acción (`subject`), Composición (`composition`), Soporte (`support`), Setup (`setup`), Duración (`durationSeconds`), Estado (`status`), Intención narrativa (`intention`), procedencia (`origin`), vínculo Writer y estado Storyboard.

## Semántica pendiente

- `Tiempo`: no existe una definición autoritativa.
- `Cro`: no existe campo ni definición fiable.
- `Plano` / `Tipología`: el código distingue numeración visible y `shotType`, pero el vocabulario solicitado necesita ratificación del propietario.
- `Setup`: `text <= 40`, con fixtures como `A`; no hay unidad, constraint ni consumidor que demuestre minutos. Se conserva como `Setup`, sin renombrar ni convertir.
- `GEAR`: `support` no es equivalente seguro a equipo técnico general. Añadir GEAR persistente exige una migración; queda fuera sin autorización.

## Libre / Asistido / Sugerido antes del cambio

- Libre añade filas manuales sin IA.
- Asistido ofrece una plantilla fija de master, individuales, OTS e insertos. Esto inventa cobertura y contradice el contrato solicitado.
- Asistido también puede ejecutar `POST /proposals`; esa ruta llama `createShotlistProposals()` y puede consumir IA si el feature flag lo permite.
- Sugerido usa la misma ruta generativa, muestra propuestas pendientes y permite aceptación parcial.
- Las propuestas aceptadas crean filas idempotentes usando el ID de propuesta como operación.

La corrección requerida es retirar cualquier generación de Asistido y convertirlo en revisión/aplicación determinista de evidencia ya guardada. Sugerido conserva la única acción capaz de solicitar cobertura nueva, siempre explícita y sin ejecutarse durante QA.

## Importación y exportación

- No existe importador Shotlist. El CTA abandona Shotlist y abre Writer.
- CSV actual es seguro, pero no ofrece alcance filtrado/total ni selección explícita de columnas.
- No existe exportación PDF de Shotlist. `@react-pdf/renderer` permite añadirla sin alterar el exportador de Writer.
- CSV puede implementarse sin dependencia adicional mediante parser acotado y probado.
- XLS binario real requiere un parser específico; no se debe usar `jszip`. La dependencia se decidirá tras auditar versión, licencia, tamaño y compatibilidad.

## Storyboard y Production

- El CTA de Shotlist siempre dice `Abrir Storyboard`, aunque el tablero no tenga paneles.
- El estado real puede derivarse de la respuesta de Storyboard contando paneles, sin entidad nueva.
- Crear/abrir el espacio de Storyboard no genera imágenes ni consume créditos.
- Production no consume `setup`, `lens`, `angle`, `movement`, `support`, `description` ni `notes`; lee de forma segura las columnas que usa. Las mejoras de presentación de Shotlist no deben cambiar ese contrato.

## Bloqueo de referencias visuales

`WORK.md` está disponible y fue leído completo. El archivo `filmatta_shotlist_beta_ux_v1.zip` y sus cuatro capturas no están presentes en Descargas, el workspace ni los adjuntos visibles para esta tarea. No se realizará ajuste visual final ni se afirmará cumplimiento de nombres de captura hasta disponer de ese paquete.
