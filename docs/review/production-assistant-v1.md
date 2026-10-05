# Production Assistant V1 — cierre para revisión humana

Fecha de verificación: 2026-10-03. Entorno: Supabase Test `ezlycwkuzkwcnhrhiruv` y Preview protegido de Vercel. La cuenta y los dos ejemplos son sintéticos y se conservan para la revisión del propietario. Las credenciales no forman parte del repositorio.

## Evidencia funcional

La ejecución navegada con una cuenta FILMATTA ordinaria completó 9 comprobaciones sin errores de consola ni respuestas 5xx. El reporte reproducible está en `public/review/production-assistant-v1/report.json` y las cinco capturas públicas están en esa misma carpeta.

| Requisito | Prueba | Resultado |
| --- | --- | --- |
| Estado vacío | Abrir la producción manual sin jornadas ni necesidades | PASS; no se presenta como “lista” |
| Crear desde fuente sin IA | Crear una producción temporal desde la Shotlist sintética en el Preview | PASS; se verificó la fuente y se retiró sólo el artefacto temporal |
| Programar planos | Añadir un plano no programado y consultar persistencia | PASS |
| Evitar duplicados | Consultar por `production_id + source_shot_id` con la cuenta ordinaria | PASS; exactamente una fila |
| Timeline horizontal | Abrir Día 1, 18:00–02:00 +1 | PASS |
| Pantalla vs. rodaje | Comparar segundos de fuente con minutos estimados | PASS |
| Cobertura por jornada | Mara/Elena confirmada en Día 1 y no disponible en Día 2; Llaves sin asignar | PASS |
| Reconfirmación | Cambiar la fecha de Día 1 y observar la advertencia; restaurar el fixture | PASS |
| Tareas y recarga | Crear/completar tarea, recargar y comprobar estado | PASS |
| Vista móvil | 390 × 844, sección Tareas | PASS |
| Autorización | QA remota previa: lectura/escritura cruzada bloqueadas y 8 tablas con RLS | PASS |

## Clasificación de seguridad del lockfile

Auditoría: Node `24.20.0`, npm `11.19.0`, `package-lock.json` Git blob `131dd3cbbf064da3f3b7da9d3ffefb61b4826bad`. Se ejecutó `npm audit --json` sin aplicar correcciones. Resultado: 1 crítico y 6 altos. El lockfile no cambió.

| Hallazgo | Ruta / uso | Condición de explotación y exposición | Corrección mínima recomendada |
| --- | --- | --- | --- |
| **Crítico — `next@16.3.4`**, directo; GHSA-vcvr-r3jv-pc5j / CVE-2026-94545 | Runtime y build | Requiere `ImageResponse` de Node y valores controlados por atacante en SVG. Búsqueda completa sin `ImageResponse`, `next/og`, `opengraph-image`, `twitter-image` ni `generateImageMetadata`; exposición actual **no aplicable al código presente**, aunque la versión instalada sí está afectada. | Actualizar de forma acotada Next y `eslint-config-next` a una versión 16.3.x corregida; el advisory fija `16.3.6` y npm propone `16.3.8`. Volver a ejecutar lint/build/QA. |
| **Alto — `brace-expansion@1.1.18` y `5.0.9`**, transitivo; GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7 y GHSA-q2hr-2g5m-vwhr | Desarrollo: `eslint → minimatch` y `eslint-config-next → typescript-eslint → minimatch` | Patrones con llaves profundamente anidados o de reescritura pueden agotar pila/CPU. No existe entrada web hacia estas rutas; los patrones de lint son del repositorio. Exposición remota **no comprobada**; exposición local/CI exige un patrón malicioso en archivos/configuración. | Resolver a `1.1.21+` para la rama 1.x y `5.0.12+` para la rama 5.x mediante una actualización compatible de la cadena; validar lint. |
| **Alto — `braces@3.0.3`**, transitivo; GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 | Desarrollo: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch` | AST profundamente anidado puede agotar la pila. No hay ruta de runtime ni entrada pública observada; exposición remota **no aplicable**, exposición CI **no comprobada**. El aviso es no revisado y la auditoría actual no identifica una versión 3.x corregida. | No usar el downgrade mayor sugerido por npm. Actualizar la cadena cuando publique una versión compatible corregida o fijar una versión corregida sólo después de validar lint. Mantenerlo clasificado, no PASS. |
| **Alto — `micromatch@4.0.8`**, transitivo | Desarrollo; hereda `braces@3.0.3` | Mismas condiciones; no es un advisory independiente en este informe. Exposición remota **no aplicable**. | Actualización compatible que elimine el `braces` afectado. |
| **Alto — `fast-glob@3.3.1`**, transitivo | Desarrollo; hereda `micromatch → braces` | Mismas condiciones; patrones controlados por el repositorio. Exposición remota **no aplicable**. | Actualización compatible de `@next/eslint-plugin-next`/`fast-glob`. |
| **Alto — `@next/eslint-plugin-next@16.3.4`**, transitivo | Desarrollo; hereda `fast-glob → micromatch → braces` | Sólo lint en la configuración observada. Exposición remota **no aplicable**; CI localmente alcanzable con patrones maliciosos, no demostrados. | Mantener alineado con la actualización acotada de Next 16.3.x. |
| **Alto — `eslint-config-next@16.3.4`**, directo | Desarrollo; agrega la cadena anterior | No forma parte del bundle de runtime, pero sí del lint/CI. Exposición remota **no aplicable**; riesgo CI **no comprobado**. | Actualizar junto con Next a una versión 16.3.x compatible que resuelva la cadena. No aceptar el downgrade automático a 14.2.35. |

Conclusión de seguridad: los hallazgos están clasificados. No se demostró una ruta explotable desde Production V1. Aun así, la dependencia directa crítica debe corregirse antes de promover la rama para evitar que una futura ruta `ImageResponse` vuelva alcanzable el riesgo sin aviso; los altos de tooling permanecen en seguimiento hasta que exista una cadena compatible corregida.

Fuentes: [advisory de Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [brace-expansion nested recursion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [brace-expansion parse recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), [brace-expansion quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Base y migración

- Base reportada y `origin/staging` al verificar: `0d0ccf8856e907b1b71168d173e30ad78a37ca74`.
- Merge-base con la rama Production: el mismo SHA; `origin/staging` es ancestro de la rama.
- Storyboard/Sketcher está incluido en esa base: existen las rutas `app/shotlists/[id]/storyboard`, `components/storyboard/StoryboardSketcher.tsx` y las migraciones `20261002230000_storyboard_sketcher_foundation_v1.sql` / `20261002231000_storyboard_conflict_sqlstate.sql` en el árbol del commit.
- Supabase Test registra `20261003010000 / production_assistant_foundation_v1`; la consulta adicional devuelve 8 tablas `production_%` con RLS.
- No se reaplicó ninguna migración. Los únicos cambios remotos de esta continuación son datos QA sintéticos; no hubo cambio de schema.
