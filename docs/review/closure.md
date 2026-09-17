# Cierre Navigation + Catalog Foundations

Fecha: 2026-09-17. Rama `feature/navigation-landings-catalog-foundations`; worktree `G:\PROYECTOS\filmatta-navigation-landings`.

## Precheck y commits

Working tree inicialmente limpio, HEAD `ba4d87e9f442e821e1bcfc36f9918a60ae881af3`, igual a main local y al main remoto consultado. Base histórica `c542b0a7c6e8ecd5ca578c1271819ebed46cfd49`. No se cambió de rama ni se reutilizó el checkout Billing; sus cambios locales ajenos se conservaron.

| Commit existente | Bloque |
| --- | --- |
| bcb7ab3 | Navegación A |
| f47aeb0 | Landings B |
| d5f8e07 | Catálogos C |
| 8193537 | Supabase Test real: migraciones previas |
| 349243e | Marketplace D |
| b8e6660 | Jobs E |
| 3855445 | Tools F |
| 6fb7f17 | Revisión build/Test/capturas |
| ba4d87e | QA del Preview remoto histórico |
| 5cd8a1d | Este cierre: unidades, presets, flujos conceptuales y tests adicionales |

El commit documental posterior incluye este informe, arquitectura consolidada, evidencia Test sin secretos y capturas renovadas. No se hicieron push, merge o deploy. Diff de producto contra main: sólo Tools y tests; SQL, Billing, Stripe, Mux, grants y Auth sin diferencias. El bloque histórico A–F ya está en main.

## Verificación actual

| Comprobación | Resultado |
| --- | --- |
| Billing | 54/54 |
| Navegación/contenido | 8/8 |
| Catálogos/acciones/validación | 14/14 |
| SQL limpio PGlite/RLS | 9/9 |
| Tools | 8/8 tras añadir unidades y umbrales MB/GB/TB |
| Auth/PostgREST Test real | 3/3 suites: Profiles/Opportunities, Services y Jobs |
| Profiles Test ampliado | Repetido OK con paginación real y distinción de slugs |
| Navegador con transporte local | 21/21: navegación, roles, drawer, errores, formularios y calculadoras |
| Build final + Supabase Test real | 2/2: 70 combinaciones ruta/ancho y ciclo owner/contacto/acceso ajeno/admin |
| TypeScript | `tsc --noEmit` y comprobación del build, correctos |
| ESLint completo | 0 errores, 8 advertencias históricas `<img>` |
| Build optimizado local | Next.js 16.3.4 correcto; configuración pública Test y Billing desactivado |
| git diff --check | Correcto |

Se repitieron las pruebas funcionales con Auth y PostgREST reales, sin mocks para demostrar RLS. Los usuarios sintéticos se crean y eliminan con el helper administrativo; las operaciones de producto usan sesiones normales. La prueba visual local de transporte es una regresión complementaria y no se presenta como prueba de permisos de base de datos.

Historial de las cuatro migraciones confirmado en Test; todas ya aplicadas. No se volvió a ejecutar SQL de migración. Comprobación final: cuatro migraciones, RLS activo y cero usuarios temporales restantes, en [closure-test-evidence.json](closure-test-evidence.json).

Production no se consultó ni modificó. No podemos declarar sus migraciones pendientes o ausentes sin una auditoría autorizada de su historial. Este cierre no añade migraciones ni necesita rollout SQL.

## Evidencia visual actual

Se regeneraron las 27 capturas D–F del build final conectado a Test, indexadas en [screenshots-d-f.md](screenshots-d-f.md). Se inspeccionaron como imágenes Marketplace, Jobs, Writer y Production Assistant en desktop/móvil; Tools desktop y las cuatro calculadoras móviles. Sin overflow en siete anchos; no se observaron solapes ni controles cortados en las capturas revisadas. Las cinco landings iniciales se conservaron y pasaron la regresión de navegación/tamaños.

Ejemplos:

- [Marketplace desktop](df-descubre-marketplace-1440.png) / [móvil](df-descubre-marketplace-390.png).
- [Jobs desktop](df-descubre-jobs-1440.png) / [móvil](df-descubre-jobs-390.png).
- [Writer desktop](df-tools-writer-1440.png) / [móvil](df-tools-writer-390.png).
- [Production Assistant desktop](df-tools-production-assistant-1440.png) / [móvil](df-tools-production-assistant-390.png).
- [Almacenamiento móvil](df-tools-utilidades-almacenamiento-390.png) / [proporciones móvil](df-tools-utilidades-relacion-aspecto-390.png).

El Preview remoto descrito en `remote-preview.md` es evidencia histórica; no se ha actualizado con `5cd8a1d`. Las capturas de cierre actuales proceden del servidor local optimizado y del Supabase Test real.

## Reproducción sin secretos

Desde el worktree, ejecutar:

```powershell
node --test tests/billing/*.test.mjs tests/navigation/*.test.mjs tests/catalogs/*.test.mjs tests/database/*.test.mjs tests/tools/*.test.mjs
npx tsc --noEmit
npx eslint .
npx playwright test
$env:FILMATTA_RUN_REMOTE_TESTS='ezlycwkuzkwcnhrhiruv'
# FILMATTA_TEST_ENV_FILE debe apuntar a una configuración Test privada fuera de Git.
node --test --test-concurrency=1 tests/integration/*.test.mjs
```

Para build y smoke: cargar únicamente URL/clave pública verificadas del Test; `BILLING_ENABLED=false`; ejecutar `npm run build`, después definir `FILMATTA_TEST_BUILD=true` y ejecutar `npx playwright test --config playwright.remote.config.mjs`. El guard valida el ref Test y rechaza una clave JWT de otro proyecto. No copiar `.env.local` a un deployment ni registrar credenciales.

## Alcance final y deudas

Operativos: Navigation, Profiles/Talent, Locations, Opportunities, Marketplace como directorio/contacto, Jobs sobre Opportunities, Tools y cuatro Utilities. Writer y Production Assistant: landings en desarrollo con recorridos conceptuales. Backlog: reviews, matching, pagos/contratos, notificaciones/chat, mapa, Projects completo y herramientas avanzadas. Detalles, límites de contacto y pasos de despliegue posterior en [arquitectura consolidada](../architecture/navigation-landings-catalog-foundations.md).
