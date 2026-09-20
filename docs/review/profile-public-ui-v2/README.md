# PROFILE PUBLIC UI V2 — revisión visual

## Estado

Implementación lista para revisión visual. Login y edición owner validados en un Preview temporal con Supabase Test, tras autorización explícita del usuario. El deployment temporal y su secreto server-side ya se retiraron; el Preview visual original sigue Ready. No se ha desplegado a Production, hecho merge/push ni cambiado schema/RLS.

- Rama: `feature/profile-public-ui-v2`
- Worktree: `G:\PROYECTOS\filmatta-profile-public-ui-v2`
- Base origin/main: `0f3b00e0150456f8841c14a8c1465d83e25db77b`
- Commit de producto desplegado: `a0b8d2f7dd1942677811c00fb1189aeb8a62090e`
- Preview: https://app-lg0nuiccy-filmatta.vercel.app
- Deployment Ready: `dpl_2LTjw1w4x24YvaVyavfywHDMSoVq`
- Supabase: Test `ezlycwkuzkwcnhrhiruv`; Billing deshabilitado, sin secretos ajenos.

## Referencia y cambios

Se consultaron las referencias de Profiles aprobadas en Drive: [desktop](https://drive.google.com/file/d/1Ngs8HXK139CTznZCPgLcvBGlfH-rj0iJ/view), [mobile](https://drive.google.com/file/d/1BlU6nZ-qhg1xkErvoJ1-JFnPiJ42kfC4/view) y [documento UX](https://docs.google.com/document/d/1kd--mouuk6BfPAd5m_LTfK6r4ml11lvpH-uLD01PoGA/edit). La imagen adjunta a esta tarea era de Learn, no de Profiles. Las funciones futuras que aparecen en el mockup quedan excluidas conforme a la petición actual.

1. Cabecera con cubierta cinematográfica e identidad compacta; un nombre profesional, disciplinas, ubicación aproximada y disponibilidad.
2. Reel dominante, secundarios de menor escala, trabajos/book visuales y contacto lateral en desktop. En mobile la lectura mantiene el material antes de la biografía.
3. Bio secundaria, ancho limitado y cuatro líneas; Ver más/Ver menos sólo cuando hay contenido desbordado.
4. Se eliminó el concepto visible de alias artístico y la doble identidad. Cards, perfil, metadata y editor usan el mismo nombre profesional.
5. Talento adapta retrato y book con fotografías mayores y proporciones editoriales, usando la misma tabla professional_profiles y ruta /perfiles/[slug].
6. Créditos compactos y skills/equipo subordinados; no se inventa metadata de proyectos.
7. Mi perfil empieza por identidad y material; bio breve después de reel/trabajos/book. Completitud sólo para el owner y preview reutilizando el componente público.
8. Se conserva compartir URL pública y contacto protegido con su estado real; no se simula mensajería operativa.
9. El acento #B9DCEB es discreto; se reutilizan imágenes existentes, sin nuevos assets stock ni nuevas dependencias.

## Screenshots

[Abrir galería](review.html). Todos los PNG de esta carpeta se generaron con fixtures locales explícitos, no usuarios de Production. Las capturas de la revisión manual del Preview real también se mostraron en la conversación, pero no se presentan estos archivos locales como capturas remotas.

| Superficie | 1440 | 390 |
|---|---|---|
| Profesional | [desktop](local/perfil-profesional-1440.png) | [mobile](local/perfil-profesional-390.png) |
| Talent con book | [desktop](local/perfil-talento-1440.png) | [mobile](local/perfil-talento-390.png) |
| Mi perfil | [desktop](local/mi-perfil-1440.png) | [mobile](local/mi-perfil-390.png) |
| Mucho contenido | [desktop](local/mucho-contenido-1440.png) | [mobile](local/mucho-contenido-390.png) |
| Poco contenido | [desktop](local/poco-contenido-1440.png) | [mobile](local/poco-contenido-390.png) |
| Sin reel, con book | [desktop](local/sin-reel-book-1440.png) | [mobile](local/sin-reel-book-390.png) |

También se incluyen landings, catálogos y estados loading/empty/error. Las landings se comprobaron como regresión, no se rediseñaron en esta iteración.

## Validación

- 161/161 tests de Profiles, Talent/catálogos, Auth, Navigation, Security, Billing y contratos de DB.
- 8/8 Playwright locales: jerarquía, variantes, bio, editor, filtros y estados.
- 1/1 integración real Supabase Test: owner/stranger/anon, publicación, filtros y compatibilidad legacy; fixtures propios limpiados.
- TypeScript, lint focalizado y production build: correctos.
- Revisión pública del Preview mediante sesión normal del navegador: profesional, Talent, sin reel y mínimo en 390/768/1024/1280/1440/1920; 24 combinaciones sin overflow ni completitud pública. Bio expandir/contraer correcto; reproductor sólo se monta tras interacción, sin autoplay; Contactar anónimo conduce al login.
- La suite Playwright remota NO pasó: el navegador automatizado llegó al login de protección de Vercel. No es evidencia de fallo de layout. La revisión pública se completó después con la sesión normal autorizada del navegador.
- Login y edición owner completados después en el deployment temporal dpl_CQQWsccT1eFDjouYLox2kEweUbu1 del mismo código de producto. Dos usuarios entraron por el formulario normal. El owner creó un borrador, publicó, editó desde mobile, recargó y volvió a borrador. Se verificaron logout, redirección de /mi-perfil sin sesión, aislamiento del editor del segundo usuario y restricciones RLS con sesiones normales. Ver AUTH-QA.md. El Preview visual original conserva su configuración sin service_role; su login no queda habilitado permanentemente.
- Los cuatro usuarios sintéticos de la revisión pública fueron eliminados de Test; se verificó que los usuarios y sus perfiles públicos desaparecieron. Se eliminó el archivo temporal de credenciales.

Los logs y resultados sanitizados están en evidence/. El commit posterior de documentación/tests no cambia el código de producto del Preview.

## Privacidad y compatibilidad

Sin migraciones ni cambios de tablas, RPCs, policies, triggers, índices o RLS. Se conserva draft privado, publicación explícita, edición owner-only, contacto protegido y ausencia de email/teléfono/auth metadata en datos públicos. No se crean usuarios en Production.

`presentation.stage_name` permanece como clave histórica de almacenamiento compatible y conserva datos existentes. La UX la reutiliza como único Nombre profesional; `display_name` sigue siendo fallback abreviado para perfiles antiguos. No se elimina destructivamente ningún campo ni se introduce un segundo sistema de identidad. Una futura migración de nomenclatura puede normalizar esta clave sin cambiar la UX.

## Pendientes

- QA de Auth/owner completada. Se retiró el deployment temporal completo para eliminar su secreto asociado; quedan las evidencias sanitizadas y el Preview visual original sin esa clave.
- Revisión visual del usuario antes de cualquier Production deploy.
- Contacto operativo, Follow, subida directa de archivos y Boost/Talent+ siguen fuera de alcance.
- Datos sin imágenes/reels muestran una presentación sobria; no se inventa portfolio para completarlos.

La primera revisión automática bloqueó la extracción de un token bypass Vercel; no se ejecutó ni se necesitó: se utilizó acceso normal. El envío inicial de service_role Test también quedó bloqueado. El usuario lo autorizó posteriormente sólo como secreto server-side temporal para QA; esa validación se completó y su deployment se eliminó al terminar.
