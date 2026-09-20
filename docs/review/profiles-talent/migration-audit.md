# Auditoría de migración — Preview

Migración: `20260920010000_profile_presentation.sql`.
Destino autorizado: Supabase Test `ezlycwkuzkwcnhrhiruv`. Production no se consulta ni modifica.

## Cambio y necesidad

Añade una columna `professional_profiles.presentation jsonb NOT NULL` con default vacío: portrait_url, stage_name, work_area, rate_range, book y credits. La identidad, disciplinas, ciudad, disponibilidad y reel existentes permanecen en la misma tabla. No crea un sistema de Talento.

El CHECK valida tipos, claves permitidas, longitudes, HTTPS para imágenes, máximo de 6 imágenes y 12 créditos. La aplicación normaliza además las URLs y no usa proxy de imágenes para contenido de usuarios.

Añade un validador privado y tres RPCs con search_path vacío:
- save_my_professional_portfolio: autenticación obligatoria; delega en save_my_professional_profile y actualiza sólo auth.uid(), en una transacción.
- get_public_professional_portfolio: proyección explícita, exclusivamente is_public.
- list_public_professional_portfolios: reutiliza filtros/paginación/Talento del catálogo anterior, sin IDs ni identidad privada; omite rango/créditos de las cards.

## Compatibilidad y permisos

No altera policies, privilegios de tabla ni las RPCs anteriores. El nuevo guardado sólo se concede a authenticated; lecturas a anon/authenticated. El validador privado no se expone. RLS owner-only permanece activo.

Requiere las migraciones de perfiles (20260910120000), slugs (20260910220000) y catálogo (20260916010000), presentes en main y comprobadas en Test. La compatibilidad con el código de Production actual se apoya en conservar esos contratos; no sustituye el preflight del historial de Production antes de su futuro rollout.

Los registros existentes reciben sólo el default vacío. No hay UPDATE de datos previos, borrados, cambios de slug ni publicación automática. PostgreSQL puede necesitar un bloqueo corto de ALTER TABLE y validar el CHECK sobre la tabla; programar el rollout según tamaño/carga de Production.

## Fallos y reversión

BEGIN/COMMIT hace atómica la migración. El aplicador Test registra la versión dentro de la misma transacción y recarga PostgREST. Se verifica historial antes de ejecutar; no es una migración para repetir a ciegas.

Rollback preferido: volver al código anterior y conservar columna/RPCs aditivas. Las RPCs anteriores siguen funcionando y guardan sin borrar presentation. Así no se pierde material agregado durante la feature. No ejecutar DROP de la columna en rollback normal; una reversión destructiva exigiría exportar y preservar antes esos datos.

Antes de Production: confirmar dependencias/historial, aplicar esta migración exacta y después desplegar aplicación. No desplegar el nuevo código antes del schema.
