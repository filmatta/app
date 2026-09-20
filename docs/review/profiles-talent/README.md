> Revisión local inicial. Estado actualizado: [Preview validado y listo para merge](final-preview.md).

# PROFILES + TALENT POLISH READY FOR REVIEW

Implementación local terminada para revisión visual. Sin commit, push, deploy ni cambios en Supabase remoto.

## 1. Rama y worktree

- Rama: `feature/profiles-talent-polish`.
- Worktree: `G:\PROYECTOS\filmatta-profiles-talent`.
- Base solicitada al crear el worktree: `101a26cf203448e806716d80891da704cfb8c214`.
- Durante la tarea, la referencia compartida `origin/main` avanzó a `b09684a6dc356d34bcc279e2048b845c641326b1` con Google OAuth y recuperación de contraseña. No se incorporaron esas ramas. La integración posterior debe sincronizar main y repetir Auth.
- Cambios locales concentrados en Perfiles/Talento; main no fue editado.

## Referencia de producto consultada antes de diseñar

[FILMATTA Roadmap Maestro 2026.md en Google Drive](https://drive.google.com/file/d/1G1bDCR9hanolWMSuLDjXQ-1vr55ha-IB/view?usp=drivesdk), localizado en la carpeta indicada, sección Professional Profiles. Confirma disciplinas múltiples, experiencia/créditos, reel/highlights, disponibilidad, ciudad, rango opcional, equipo, contacto protegido, URL pública, completitud y compartir. Follow se mantiene como relación ligera futura sin contador público; Boost/Talent+ queda para después. No se implementaron feed, ranking o popularidad.

## 2. Archivos modificados

[Inventario completo](files.md). Incluye rutas, componentes, helpers, migración, pruebas y manifiesto de imágenes. Las capturas de otras tareas regeneradas por la regresión fueron restauradas; esta evidencia vive sólo en esta carpeta.

## 3. Landings

Composición editorial específica para Perfiles y Talento, con los headlines solicitados. Negro, carbón, marfil y acento #B9DCEB moderado. Hero visual, argumento de portafolio, identidad multidisciplina, URL compartible y conexiones reales con Oportunidades, Jobs, Servicios y Learn. Talento usa un retrato editorial con indicación explícita de que no es un miembro.

## 4. Catálogos

Consulta pública paginada sobre professional_profiles. Filtros de disciplina, ciudad y disponibilidad existentes; en móvil se contraen cuando no hay filtros activos. Estados vacíos distintos para un catálogo inicial y una búsqueda sin resultados, carga con proporciones de imagen, errores legibles y paginación conservada.

## 5. Cards

Imagen de trabajo/reel o retrato, nombre profesional o alias declarado, disciplinas, ciudad/zona, disponibilidad e indicador de reel/book sólo si existe. Sin biografías largas ni contadores. Fallback tipográfico al faltar o fallar una imagen.

## 6. Perfil público

Identidad → reel/imagen principal → bio → book/trabajos → créditos → habilidades/equipo → disponibilidad/contacto. Reel responsive de YouTube/Vimeo por carga voluntaria, sin autoplay ni SDK nuevo. YouTube usa dominio de privacidad; Vimeo conserva el hash de enlaces no listados. Proveedores no reconocidos abren el original de forma segura. Imágenes lazy, enlaces originales disponibles, botón de compartir con portapapeles como alternativa.

## 7. Especialización de Talento

Actuación y Modelaje filtran el mismo registro profesional. Los perfiles híbridos conservan todas sus disciplinas. Misma URL /perfiles/[slug], con mayor protagonismo del retrato y book. No hay tabla ni identidad de Talento.

## 8. Mi perfil

Secciones ancladas, estado guardado Borrador/Público, cambios pendientes, vista previa privada dentro de un diálogo accesible y guardado con estado de espera. Reels, imágenes y créditos se añaden, eliminan y reordenan con botones accesibles. Completitud de 8 campos verificables; equipo, rango y alias opcionales no penalizan. La vista previa no publica nada. Se preserva el nombre profesional abreviado del sistema existente.

## 9. Privacidad y migración

La carencia técnica comprobada era que el modelo no guardaba retrato, book, alias, créditos, zona ni rango; el catálogo tampoco proyectaba material visual. Se entrega una migración **aditiva**, sin cambiar RLS ni sustituir la identidad:

`supabase/migrations/20260920010000_profile_presentation.sql`

Añade presentation a professional_profiles, con validación y límites; conserva las funciones anteriores y añade lectura pública y un guardado atómico que reutiliza la autorización existente. Las funciones públicas exigen is_public, no devuelven user_id, email, teléfono ni auth metadata. El propietario se deriva de auth.uid(), nunca del formulario. Guardar borrador retira el perfil de detalles y catálogos. No se aceptan protocolos ejecutables; imágenes sólo HTTPS y sin proxy del servidor.

**La migración debe aplicarse a Preview antes de desplegar este frontend allí.** No se aplicó a ninguna base remota. Contactar respeta la preferencia cerrada y el acceso con cuenta; su estado indica honestamente que las solicitudes entre perfiles todavía no están habilitadas.

## 10. Screenshots desktop/mobile

[Abrir galería comparativa](review.html). Los nombres, datos y retratos de las fichas son fixtures locales ficticios; las fotografías son ilustraciones de stock, no usuarios reales. Hay 14 capturas completas y 14 capturas del primer viewport.

| Superficie | 1440 px | 390 px |
|---|---|---|
| Landing Perfiles | [Desktop](landing-perfiles-1440.png) | [Mobile](landing-perfiles-390.png) |
| Landing Talento | [Desktop](landing-talento-1440.png) | [Mobile](landing-talento-390.png) |
| Catálogo Perfiles | [Desktop](catalogo-perfiles-1440.png) | [Mobile](catalogo-perfiles-390.png) |
| Catálogo Talento | [Desktop](catalogo-talento-1440.png) | [Mobile](catalogo-talento-390.png) |
| Perfil profesional | [Desktop](perfil-profesional-1440.png) | [Mobile](perfil-profesional-390.png) |
| Perfil Talento | [Desktop](perfil-talento-1440.png) | [Mobile](perfil-talento-390.png) |
| Mi perfil | [Desktop](mi-perfil-1440.png) | [Mobile](mi-perfil-390.png) |

Las pruebas de layout también cubrieron 768, 1024, 1280 y 1920 px. Se inspeccionaron visualmente landings, catálogos, perfil público profesional/Talento y editor. Sin scroll horizontal en las 42 combinaciones (6 superficies, dos variantes de perfil, 6 anchos).

## 11. Validación

- 87 pruebas de lógica/base de datos: Profiles, Talent, media, completitud, guardado, privacidad/publicación, catálogos, navegación, Auth, seguridad y compatibilidad de RLS existente. 87 aprobadas.
- 25 regresiones de navegador de navegación, header y cuenta aprobadas.
- 6 pruebas de navegador de Profiles/Talent aprobadas, con revisión adicional del flujo de publicación y capturas definitivas después de ajustar el activo editorial.
- TypeScript: aprobado.
- Lint focalizado de todos los archivos TS/TSX/MJS afectados: aprobado.
- Production build local: aprobado con configuración local de prueba, sin deploy.
- git diff --check: aprobado.
- Las pruebas de SQL ejecutaron las migraciones en PostgreSQL embebido (PGlite). Las pruebas de navegador usan transporte Supabase ficticio local; no sustituyen el smoke test con Supabase real en Preview.
- La reproducción se verificó como interacción y URL de proveedor con respuesta local; revisar un reel autorizado real en Preview antes de publicar.

Comandos reproducibles:

```text
node --test tests/profiles/*.test.mjs tests/catalogs/*.test.mjs tests/navigation/*.test.mjs tests/auth/*.test.mjs tests/security/*.test.mjs tests/database/catalog-rls.test.mjs
npx playwright test tests/e2e/profiles-polish.spec.ts tests/e2e/navigation.spec.ts tests/e2e/header-polish.spec.ts tests/e2e/account-dropdown.spec.ts
npx next typegen
npx tsc --noEmit
npm run lint -- app/mi-perfil app/perfiles app/talento app/descubre/[vertical]/page.tsx components/profiles components/catalogs/ProfileCatalog.tsx lib/profiles tests/profiles tests/e2e/profiles-polish.spec.ts tests/e2e/profiles-fixture.mjs tests/e2e/mock-supabase.mjs tests/catalogs/catalogs.test.mjs
npm run build
git diff --check
```

## 12. Deuda y siguientes pasos de integración

1. Aplicar migración en un entorno Preview y verificar guardado/publicación con Supabase real; no se modificó Production.
2. Contacto entre perfiles y Follow siguen pendientes como funciones operativas; no hay botones que finjan enviar solicitudes o seguir usuarios, ni contador público.
3. Material por URL en esta versión. Subida directa de retratos/book/videos, almacenamiento y limpieza quedan pendientes. No se incorporó Mux para reels.
4. Enlaces externos pueden expirar o bloquear embeds. Se conserva enlace al original y fallback visual.
5. Rango orientativo es texto opcional; no genera pagos ni filtros de compensación. Zona es aproximada; no hay mapa ni geolocalización.
6. Sincronizar con main actualizado y repetir regresiones antes de integrar. Las pruebas de Auth de esta entrega corresponden a la base aislada original.
7. Boost/Talent+, seguidores públicos, feed, matching y ranking permanecen fuera del alcance.

## Fuentes visuales

Nuevo [retrato editorial de Pexels](https://www.pexels.com/photo/black-and-white-photo-of-woman-s-face-13306757/), descargado como WebP de 1200×1500 (49.5 KB). Se reutiliza monitor.webp con fuente ya registrada. [Licencia consultada](https://www.pexels.com/license/). Manifiesto actualizado en content/image-sources.json.
