# Production Readiness V1

Fecha: 2026-10-03. Rama: `codex/production-assistant-readiness-v1`. Base fija: `8b6fb9a59dbd6e9363a9f0020d6a1f0d0ed5420b`, descendiente de `origin/staging@0d0ccf8856e907b1b71168d173e30ad78a37ca74`.

## Dependencias y seguridad

- `next`: `16.3.4` → `16.3.8`.
- `eslint-config-next`: `16.3.4` → `16.3.8`.
- Transitivas explicables: `@next/env`, `@next/eslint-plugin-next` y ocho paquetes opcionales `@next/swc-*`, todos `16.3.4` → `16.3.8`.
- React, React DOM, Konva, Supabase, PDF, Stripe, OpenAI y el resto de dependencias directas no cambiaron.
- `npm ci`: PASS con npm `11.19.0` y Node `24.20.0`.
- Auditoría completa: 1 crítico + 6 altos → 0 críticos + 6 altos.
- Auditoría sin devDependencies: 1 crítico → 0.

El crítico corregido es GHSA-vcvr-r3jv-pc5j / CVE-2026-94545, RCE condicionada a `ImageResponse` de Node con valores controlados por atacante en SVG. La base no contiene `ImageResponse`, `next/og`, `opengraph-image`, `twitter-image` ni `generateImageMetadata`, pero la dependencia instalada sí estaba en el rango vulnerable. Next 16.3.8 está por encima de la primera versión corregida 16.3.6 y es el parche 16.3 recomendado por el release oficial del 30 de septiembre de 2026.

Los seis altos restantes pertenecen a la cadena de lint/desarrollo: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`, más dos ramas de `brace-expansion`. No se encontró entrada web hacia esos procesadores de patrones. El riesgo es local/CI y requiere patrones controlados por el repositorio. No se aceptó el downgrade mayor a Next 14 sugerido por npm, ni se añadieron overrides. Los informes estructurados están en `docs/review/production-readiness-v1/audit-before.json` y `audit-after.json`.

## Validación local y Test

| Área | Resultado | Conteo / evidencia |
| --- | --- | --- |
| TypeScript | PASS | build y `tsc --noEmit` |
| Lint | PASS con deuda previa | 0 errores, 14 avisos |
| Build optimizado | PASS | Next 16.3.8, 58 páginas estáticas y rutas dinámicas compiladas |
| Auth | PASS | 35/35 |
| Security | PASS | 18/18 |
| Navigation / CREATE | PASS | 19/19 unitarias + 4/4 E2E dirigidas |
| Writer | PASS con nota ambiental | 304/305 en corrida general; el único fallo fue permiso de sandbox del worker PDF, y la repetición aislada pasó 2/2 |
| Writer E2E dirigido | REVIEW por deuda de base | 12/13; guardado, recarga, PDF, importación y responsive pasaron. La altura inicial esperaba 360 y recibe 440 tanto en 16.3.8 como en Foundation 16.3.4 |
| Storyboard / Sketcher | PASS local | 11/11 |
| Production / Shotlist / Breakdown | PASS | 24/24, incluido dataset de 150 escenas y 3,000 planos |
| Tools | PASS | 8/8 |
| Supabase Test Production | PASS | 6/6, usuarios temporales eliminados |
| Supabase Test Writer | PASS | 1/1, usuarios temporales eliminados |
| Supabase Test Storyboard heredado | BLOQUEADO POR ENTORNO | faltó `FILMATTA_TEST_ENV_FILE`; se detuvo antes de crear datos |

La corrida E2E general se detuvo después de 47/103 casos al acumular fallos preexistentes fuera del alcance (menú de cuenta, perfiles y headers). No se presenta como PASS. La selección dirigida posterior cubrió CREATE y Writer; el único fallo dirigido fue reproducido idénticamente en Foundation.

## Datos

- Cero migraciones nuevas o reaplicadas.
- Consulta de sólo lectura: presentes `20261002230000_storyboard_sketcher_foundation_v1`, `20261002231000_storyboard_conflict_sqlstate` y `20261003010000_production_assistant_foundation_v1`.
- Las ocho tablas `production_%` mantienen RLS.
- Se conservaron las producciones `7f94bb79-2c64-466f-b85a-e153a4a102f7` y `81fa6983-d1b5-462f-99be-68ef03657c4b`.
- La cuenta persistente ordinaria pudo iniciar sesión. Las credenciales continúan sólo en el manifiesto temporal privado del sistema operativo.

## Preview

Pendiente de completar tras desplegar y recorrer el commit final. El Preview Foundation y su alias no se modifican.
