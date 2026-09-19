# SV1-01 — Auth y redirecciones seguras

Esta sección conserva la revisión inicial de SV1-01. El paquete SV1-04 posterior
añade `Secure` explícito y valida cookies reales en HTTPS; véanse
`sv1-04-web-edge.md` y `sv1-final-validation.md` para el estado final.

## Cookies y sesión revisadas

FILMATTA no sobrescribe actualmente las opciones de cookies de `@supabase/ssr`.
Con la versión instalada, las opciones predeterminadas esperadas son:

- `Path=/`;
- `SameSite=Lax`;
- `HttpOnly=false`, porque el cliente de Supabase en el navegador necesita leer y
  actualizar la sesión;
- `Max-Age=400 días` para los fragmentos de sesión;
- cookies host-only mientras no se configure `Domain`;
- `Secure` no se fija explícitamente en la aplicación ni en los valores
  predeterminados inspeccionados del SDK.

El `proxy.ts` crea un cliente SSR en cada solicitud, lee todos los fragmentos y
propaga cada `Set-Cookie` devuelto por Supabase con las mismas opciones. Los Server
Components y Server Actions usan el mismo adaptador de `cookies()`; si el contexto
no permite escribir, la actualización queda a cargo del proxy en la siguiente
solicitud.

No se cambió `HttpOnly` ni `Secure` en SV1-01. Antes de modificarlos hay que comprobar
el comportamiento real del cliente de navegador y de la rotación de tokens.

## Verificación pendiente en Preview HTTPS

Usar un Preview conectado únicamente a Supabase Test y revisar en DevTools o mediante
una prueba HTTP autenticada:

1. todos los fragmentos `sb-*-auth-token*` emitidos en login, callback, refresh y
   logout;
2. presencia efectiva de `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age`/`Expires` y
   ausencia de un `Domain` más amplio de lo necesario;
3. que ninguna cookie de sesión viaje por HTTP y que HTTPS/HSTS impidan downgrade;
4. que login, refresh, callback, recuperación, cambio de contraseña y logout roten o
   eliminen todos los fragmentos sin dejar cookies antiguas;
5. que la sesión no aparezca en URLs, HTML, logs ni respuestas cacheables.

Esta revisión debe ejecutarse en Preview HTTPS. El código local y los valores
predeterminados del paquete no prueban qué atributos termina emitiendo la plataforma.
