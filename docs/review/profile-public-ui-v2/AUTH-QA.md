# Cierre de QA autenticada — Preview temporal

## Resultado

PASS. Login y edición real de Mi perfil completados en Supabase Test por formularios y Server Actions existentes; sin inyectar cookies de sesión, extraer bypass de Vercel, relajar Auth/RLS o modificar código del producto.

- Rama: feature/profile-public-ui-v2.
- Commit probado: 55136cb64f5acfda3dd49b0d826e2dd64927c5b6 (producto idéntico a a0b8d2f).
- Deployment temporal: dpl_CQQWsccT1eFDjouYLox2kEweUbu1, Ready durante QA y eliminado al finalizar.
- Proyecto Supabase: ezlycwkuzkwcnhrhiruv (Test).
- Preview visual conservado: https://app-lg0nuiccy-filmatta.vercel.app.

## Casos completados

1. Login por correo/contraseña en la UI con dos cuentas sintéticas independientes.
2. Owner: creación de portfolio completo mediante el editor y guardado como borrador.
3. Borrador invisible para anon y segundo usuario, tanto por RPC público como lectura privada ajena.
4. Publicación por el editor; perfil accesible por RPC público y catálogo Talent derivado.
5. Edición en mobile de ciudad/zona; guardado y recarga conservan los valores. Reel, book, bio, disciplinas, habilidades y crédito permanecen.
6. Segundo usuario recibe su propio editor vacío y no el portfolio ajeno.
7. Escrituras directas de non-owner y anon rechazadas en las cuatro fases; datos owner preservados. Las comprobaciones usan sesiones Auth normales y anon, no service_role.
8. Perfil público sin email, teléfono, user_id ni metadata privada. Contacto anónimo dirige a login; contacto autenticado conserva su estado próximamente.
9. Despublicación por UI: el perfil vuelve a borrador y desaparece de las lecturas públicas.
10. Logout por la UI y acceso a /mi-perfil sin sesión redirigido a login.
11. Editor autenticado comprobado a 390, 768, 1024, 1280, 1440 y 1920 píxeles CSS reales, sin overflow horizontal. Se compensó el zoom del navegador y se verificó innerWidth; una completitud visible sólo en el editor.

Las capturas del Preview autenticado se mostraron en la conversación. Los PNG de la galería existente siguen etiquetados como fixtures locales; no se hacen pasar por screenshots remotos.

## Uso y retirada del secreto

La clave Test se recuperó en memoria y se pasó sólo como SUPABASE_SERVICE_ROLE_KEY al runtime servidor del deployment temporal. La variable de build del mismo nombre quedó vacía; no se utilizó ningún NEXT_PUBLIC_* para el secreto. El módulo administrativo existente importa server-only. El secreto no se escribió en archivos, repositorio, commits, documentación, screenshots ni logs. El control normal de intentos de Auth pudo operar; las Server Actions de perfiles siguieron usando el cliente de sesión del usuario y sus RPCs con RLS.

Billing quedó deshabilitado; no se iniciaron pagos. No se cambiaron variables compartidas del proyecto ni Production.

Al terminar:

- Dos usuarios sintéticos eliminados mediante Auth Admin de Test.
- Cero professional_profiles residuales para esos dos user_id, comprobado por SQL read-only. La tabla no concede SELECT a service_role; se preservó esa restricción.
- RPC público del slug QA devuelve lista vacía.
- Deployment temporal eliminado, con confirmación posterior HTTP 404 de la API Vercel. Su secreto runtime ya no queda en un deployment activo.
- Preview visual original confirmado Ready.
- Scripts y manifiesto temporales de esta QA eliminados tras guardar sólo evidencia sanitizada.

El Preview visual conservado no tiene login habilitado permanentemente mediante esta clave temporal. La validación quedó concluida antes de retirarla; no se mantiene acceso privilegiado innecesario.

## Alcance de las pruebas

Esta continuación no cambió el código de producto. Se conservan los resultados previos de 161 tests, 8 Playwright locales, integración DB/RLS, TypeScript, lint y build. La suite Playwright remota anterior no se reclasifica como aprobada: esta validación adicional se hizo mediante el navegador normal y comprobaciones RLS independientes.

Se corrigieron dos detalles del arnés temporal sin tocar el producto: el cierre de sesiones del comprobador pasó a scope local para no cerrar la sesión del navegador; la comprobación de cascada pasó a SQL read-only porque professional_profiles usa user_id y mantiene SELECT restringido incluso para service_role.
