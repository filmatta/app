> Estado actualizado: [Preview remoto y revisión final](remote-preview.md). Este documento conserva la evidencia histórica de su checkpoint.

# Revisión local — Navigation / Landings / Catalogs

Entrega parcial deliberada: A + B (cinco verticales existentes) + C. El siguiente bloque es D, Marketplace/Services con contacto protegido; después Jobs y Tools. No hay Preview remoto ni cambios en Production.

Las 22 capturas se generaron con Chrome sobre el servidor local y fueron inspeccionadas visualmente. Desktop: 1440 px. Mobile: 390 px. También se comprobó ausencia de overflow en landings y header autenticado a 360, 768, 1024, 1280 y 1920 px. No se usaron capturas como sustituto de pruebas de autorización.

Las landings usan fotografías editoriales licenciadas de Pexels. Los catálogos y el formulario muestran datos ficticios identificados como pruebas exclusivamente locales; no son usuarios ni inventario de FILMATTA y no se insertaron en ninguna base remota.

| Vista | Desktop | Mobile |
| --- | --- | --- |
| Landing Perfiles | [1440](perfiles-1440.png) | [390](perfiles-390.png) |
| Landing Talento | [1440](talento-1440.png) | [390](talento-390.png) |
| Landing Locaciones | [1440](locaciones-1440.png) | [390](locaciones-390.png) |
| Landing Oportunidades | [1440](oportunidades-1440.png) | [390](oportunidades-390.png) |
| Landing Learn | [1440](learn-1440.png) | [390](learn-390.png) |
| Catálogo Perfiles | [1440](catalog-perfiles-1440.png) | [390](catalog-perfiles-390.png) |
| Catálogo Talento | [1440](catalog-talento-1440.png) | [390](catalog-talento-390.png) |
| Catálogo Locaciones | [1440](catalog-locaciones-1440.png) | [390](catalog-locaciones-390.png) |
| Catálogo Oportunidades | [1440](catalog-oportunidades-1440.png) | [390](catalog-oportunidades-390.png) |
| Catálogo Learn | [1440](catalog-cursos-1440.png) | [390](catalog-cursos-390.png) |
| Crear oportunidad | [1440](publish-opportunity-1440.png) | [390](publish-opportunity-390.png) |

## Resultado de validación

97 pruebas aprobadas: 54 Billing, 8 navegación/contenido, 11 catálogos/acciones, 6 PostgreSQL/RLS y 18 navegador. TypeScript y build correctos. Lint sin errores; ocho advertencias existentes de imágenes `<img>`. Diff sin errores de whitespace.

Las pruebas PostgreSQL ejecutan las migraciones reales en PGlite desechable. El navegador utiliza transporte Auth/PostgREST simulado: falta comprobar la integración en Supabase de Preview antes de publicación. Los dos RPCs nuevos no se aplicaron remotamente.

Se corrigieron durante la revisión: escape del foco con Shift+Tab móvil, fondo blanco al pie de Perfiles, contraste de textos secundarios, moneda/centavos de presupuestos, iconos de fecha y pérdida de valores al fallar una validación del formulario.

## Referencias de entrega

- [Auditoría, rutas, permisos, migraciones, límites y siguientes bloques](../architecture/navigation-landings-catalog-foundations.md).
- [Copys finales](../../content/landings.ts).
- [Manifiesto de fuentes y licencia de imágenes](../../content/image-sources.json).

Contacto privado y postulaciones aún no están implementados. Marketplace/Jobs/Tools y sus landings pendientes no figuran como disponibles en el menú. Las rutas públicas y sus detalles mantienen sus reglas de acceso; no se añadió middleware global de bloqueo.
