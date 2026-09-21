# Networking Foundation V1 — review de Test/Preview

Validación: 21 de septiembre de 2026. No merge, no push a main, no deploy ni migración de Production.

## 1. Rama y commits

- Rama: `feature/profiles-portfolio-polish`.
- Worktree: `G:\PROYECTOS\filmatta-profiles-polish`.
- Base de este trabajo: `093b426e3bb6c2425fe304b93452756812de8d98`.
- `1c838ac`: Projects privados, reservas de contacto, red y notificaciones.
- `eb850724da074ce2e180724082e5661091644eba`: historial anterior, RLS de outbox y fallback de avatares.
- El commit de este documento sólo añade evidencia; no cambia el código desplegado.
- `main` y `origin/main` conservan `a2e89353698e1c6ec163f06fddf0a1e9ecf2f985`.

## 2. Preview

[Preview final](https://app-3k9qkftlp-filmatta.vercel.app).

Vercel `dpl_4YrcpyjeRiXu1joMPU21DpUxSQbb`, **READY**, proyecto `prj_JWPAu87qoRstiV6YOmcEStMU6kow`, target Preview, commit `eb850724da074ce2e180724082e5661091644eba`.

No se modificaron variables de entorno. No se creó bypass de Vercel.

## 3. URLs QA

- [Cine · Demo ficticia](https://app-3k9qkftlp-filmatta.vercel.app/perfiles/demostraci-n-c).
- [Actriz QA](https://app-3k9qkftlp-filmatta.vercel.app/perfiles/actriz-q).
- [Login](https://app-3k9qkftlp-filmatta.vercel.app/login).
- [Mi perfil](https://app-3k9qkftlp-filmatta.vercel.app/mi-perfil).
- [Mi red](https://app-3k9qkftlp-filmatta.vercel.app/mi-red).
- [Solicitudes](https://app-3k9qkftlp-filmatta.vercel.app/cuenta/contactos).
- [Contactos aceptados](https://app-3k9qkftlp-filmatta.vercel.app/cuenta/contactos?box=accepted).
- [Proyectos](https://app-3k9qkftlp-filmatta.vercel.app/proyectos).
- [La última noche — privado del Productor QA](https://app-3k9qkftlp-filmatta.vercel.app/proyectos/la-ultima-noche-141ea7f9).
- [Solicitud aceptada del recorrido E2E](https://app-3k9qkftlp-filmatta.vercel.app/cuenta/contactos/980f089d-df73-4c49-9342-61ab6d7dbd85).
- [Notificaciones](https://app-3k9qkftlp-filmatta.vercel.app/notificaciones).

## 4. Cuentas de review y datos

Supabase Test exclusivamente: `ezlycwkuzkwcnhrhiruv`.

- Productor: `networking-productor-review@example.invalid`.
- Receptora: `networking-actriz-review@example.invalid`.
- Se conserva la cuenta anterior del propietario Cine; no se cambió su contraseña.
- Las contraseñas QA se entregan en el chat, no en este documento.
- Siete cuentas deliberadas con `qa_run=networking-foundation-review`: productor, actriz, cámara, arte, sonido, edición y foto. Son ficción y pueden eliminarse después del review.
- Cine conserva su portfolio, Book, Reel, preferencias y relaciones anteriores. Tiene diez seguidores publicados; siete visibles en desktop y cinco en mobile.
- Dos proyectos privados creados desde UI: **La última noche** y **Encuentro visual · QA**.
- Estados de review al cierre: una solicitud aceptada, una rechazada, una cancelada, una vencida y tres pendientes. Las pendientes vencerán naturalmente.
- Saldo del Productor al cierre: **2 disponibles / 2 reservados / 1 consumido**. Al completar inicialmente el recorrido de aceptación: **4 / 0 / 1**.
- Cero usuarios y cero grants temporales `network-qa-*` al cierre. La prueba automatizada elimina por cascada sus proyectos, solicitudes, reservas, snapshots, notificaciones y eventos de email. No creó assets de media.

## 5. Auditoría y migraciones nuevas

Se reutilizan `professional_profiles`, `profile_follows`, `catalog_inquiries`, `profile_contact_relationships`, `profile_private_settings` y la tabla histórica `projects`. Las consultas de Services/Jobs y los proyectos históricos conservan sus contratos.

Aplicadas con éxito **sólo en Test**, sin ejecutar migraciones históricas ni tocar el ledger:

1. `20260924040000_networking_projects_channels.sql`: campos aditivos de Projects V0, RPC owner y canales privados con consentimiento explícito. Los Projects V0 tienen `networking_private=true`; los históricos conservan `false`.
2. `20260924050000_networking_requests_notifications.sql`: estados de solicitud, expiración, reservas, snapshots, transiciones atómicas, notificaciones y outbox. El antiguo endpoint de envío usa el mismo flujo seguro de reserva.
3. `20260924060000_networking_private_views.sql`: red privada, prueba social pública limitada, bandejas, notificaciones y lectura de solicitudes para participantes.
4. `20260924070000_networking_outbox_legacy_history.sql`: RLS explícito del outbox y consulta separada del historial anterior, recibido/enviado.

No se renombró ninguna migración ya aplicada. Todas las tablas nuevas tienen RLS; el outbox privado no tiene policies para clientes. Los proyectos previos no pasan a públicos ni cambian de propietario. No se migraron datos privados hacia proyecciones públicas.

## 6–9. Créditos, estados, expiración y atomicidad

- Free conserva el límite existente de cinco créditos en `lifetime_v1`. Se descuentan del disponible tanto los consumos históricos como las reservas vigentes.
- Enviar crea `pending` + reserva en una transacción. No crea consumo anticipado.
- Aceptar crea `accepted`, consumo, `accepted_at`, `contact_unlocked_at`, snapshot autorizado y notificación en una transacción.
- Rechazar/cancelar/vencer libera la reserva y mantiene el contacto bloqueado.
- `pending`, `accepted`, `rejected`, `expired`, `cancelled` son los estados implementados. Reactivación queda fuera de V1; la transición se concentra en una RPC para extenderla después.
- Bloqueo transaccional por remitente antes de contar y escribir; índice único del par pending y bloqueo de la solicitud al resolverla. La doble aceptación es idempotente.
- La prueba real envió seis solicitudes simultáneas con cinco créditos: exactamente cinco reservas y un rechazo por saldo. La aceptación duplicada consumió una sola vez.
- Pro no requiere crédito, pero conserva máximo diez envíos diarios compartido con inquiries, cooldown de siete días por perfil y protección de mensajes duplicados. No hay autoaceptación ni autocontacto.
- `expires_at = created_at + 48 horas`. Test no dispone de `pg_cron`; se usa expiración transaccional al consultar wallet/bandejas/notificaciones o intentar una transición/envío. El saldo excluye reservas vencidas aunque no hubiera una consulta previa.
- Los recordatorios se generan una vez por destinatario y solicitud cuando hay actividad dentro de las últimas seis horas. **No hay entrega programada mientras nadie consulta el sistema**; no se promete un scheduler inexistente.

## 10–11. Mi red y social proof

- Herramientas privadas al final de `/mi-perfil`, después del editor. Solicitudes y Tu red muestran datos del backend; no se renderizan en perfiles públicos.
- `/mi-red`: tabs Seguidores/Siguiendo, paginación de 24 y dejar de seguir. Las RPC derivan exclusivamente `auth.uid()`, sin parámetro que permita consultar otra red.
- Sólo las identidades publicadas se proyectan con nombre, disciplina, ciudad y foto. Un perfil no publicado no revela esos campos.
- Social proof público fijo: máximo siete, sin offset ni endpoint de lista completa. Cinco en móvil y `+N` calculado sobre seguidores publicados.
- Fotografías exclusivamente de identidad. Fotos fallidas muestran inicial; nunca se usa Reel o video.

## 12–14. Projects V0 y taxonomía

Una sola entidad: `public.projects`. Nuevos proyectos privados, edición del propietario, slug único estable y estado privado/archivado. Un usuario ajeno obtiene 404 en la página; Auth/RLS impide leer el registro directamente.

Campos finales: título, tipo, cliente opcional, tipo de cliente, ciudad, zona, jornada diurna/nocturna/mixta, modalidad pagado/colaboración/por definir, fecha o periodo, resumen, roles y requisitos. No hay presupuesto obligatorio, equipo de producción, calendario, chat ni matching.

Se reutilizan `PROJECT_FORMATS`, `PROFILE_DISCIPLINES` y `PREFERENCE_GROUPS` (themes/participation/conditions), añadiendo Live session/Otro como formatos de proyecto. Publicidad, Series y Contenido digital mantienen los valores canónicos existentes. Jornada nocturna/mixta añade la condición existente `night`.

Contactar reutiliza el mismo formulario para crear un proyecto dentro del diálogo. QA móvil confirmó que conserva el mensaje, regresa a la solicitud y selecciona automáticamente el nuevo proyecto. No hay forms anidados.

Snapshot al enviar: título, tipo, ciudad/zona, jornada, modalidad económica, fecha, roles y requisitos. No comparte cliente privado ni abre acceso al proyecto. Cambios posteriores del proyecto no modifican el snapshot.

## 15–16. Notifications y Crear

- Campana desktop/mobile, hasta ocho recientes, badge real, página `/notificaciones`, marcar leída al abrir y marcar todas.
- Tipos: solicitud recibida, aceptada, rechazada, próxima a vencer y follow recibido.
- Inserciones sólo desde operaciones backend confiables. RLS propietario para lectura; RPC propietario para marcar leída.
- El botón `+`, aria-label Crear, reutiliza `Disclosure`: Proyecto → `/proyectos/nuevo`, Locación → `/mis-locaciones/nueva`, Servicio → `/mis-servicios/nuevo`. Los tres destinos fueron abiertos realmente; no se reconstruyeron Locations/Services.
- Menú sigue dedicado a navegación. No se perdieron oportunidades/encargos ni accesos de cuenta.

## 17. Contacto desbloqueado

Fuente canónica: `profile_private_settings`. Campos independientes de Auth: Instagram, WhatsApp, email de contacto escrito explícitamente y teléfono; cada uno con autorización desactivada por defecto.

Al aceptar sólo se copian canales autorizados y no vacíos. Snapshot inmutable; cambiar ajustes sólo afecta futuras aceptaciones. No se usa el email de login ni auth metadata como canal automático. Si no hay canales autorizados, se muestra un estado útil y la aceptación consume el crédito normalmente.

Sólo participantes y los administradores ya autorizados por la policy histórica pueden leer el registro. Las nuevas proyecciones de UI se limitan a los participantes. No se incluye snapshot en Profiles/Talent, Follow, búsquedas ni proyectos públicos.

QA real: pending sin datos; accepted con Instagram/email pero sin WhatsApp/teléfono; un tercero y anon bloqueados; rechazo/expiración/cancelación sin snapshot; cambios de consentimiento no alteran históricos y sí afectan futuras aceptaciones.

## 18. Email

Foundation/outbox preparado. Hay infraestructura Resend en el repositorio, pero no proveedor de correo funcional configurado para esta rama Preview/Test. No se añadió proveedor ni se enviaron emails. Nuevas solicitudes y recordatorios crean eventos deduplicados en `private.network_email_outbox`, sin acceso de clientes. Falta conectar un worker/proveedor Test y un scheduler si se requiere entrega sin actividad.

## 19. Validación

- **263/263 tests locales PASS**: suite completa, incluyendo Profiles/Talent, portfolio/Mux, Auth/MFA, Billing, navegación, seguridad y siete pruebas nuevas de DB Networking.
- TypeScript `--noEmit --incremental false`: PASS.
- ESLint focalizado: PASS.
- Build local y build Vercel del commit desplegado: PASS.
- `git diff --check`: PASS.
- `tests/integration/networking.test.mjs`: PASS con Auth/RLS real en Test, concurrencia y limpieza en `finally`.
- Recorrido UI real completo: login Productor → Crear La última noche desde `+` → perfil Actriz → Contactar/adjuntar/enviar → reserva → logout/login receptora → campana/notificación → Me interesa → logout/login Productor → Contactos y consumo. Rechazo también ejecutado por UI con Cámara QA.
- Preview final: login real Productor y Cine; editor/contacto canónico, Mi red/unfollow, snapshots, vencidas, notificaciones, proyecto editado y URL estable. Un usuario ajeno abrió la URL del proyecto y obtuvo 404 sin título filtrado.
- Capturas revisadas en el navegador a **390, 768, 1024, 1280, 1440 y 1920 px**: sin overflow. Mobile: Identidad → Bio → Disponibilidad → Reel → Videos → Book → CV → Preferencias → Contacto → Seguido por.
- Reel firmado reproduce; thumbnails de Videos visibles; Book tres columnas con medidas iguales 295×369 en desktop (4:5, cover); lightbox anterior/siguiente/Escape; sidebar a 24px durante scroll. `/talento` conserva foto/identidad, sin recursos de Reel.
- Main y Production intactos. No tokens temporales, bypass, nuevos secretos ni fixtures automatizados pendientes. Se conservan exclusivamente demos deliberadas de review.

## Límites pendientes

Email queda en outbox y el recordatorio es transaccional; no existe envío offline programado. Reactivación, chat, matching, feed y push no se implementan en V1. Los estados pending de las demos son temporales por diseño (48h), no fixtures congelados. No hay blockers para review; integrar a main requiere review visual y funcional del usuario.

## Checklist solicitado

| Criterio | Resultado |
|---|---|
| Herramientas privadas al final de /mi-perfil | PASS |
| Solicitudes card privada | PASS |
| Tu red privada | PASS |
| Seguidores tab | PASS |
| Siguiendo tab | PASS |
| Lista completa NO pública | PASS |
| Seguido por ~7 avatars | PASS |
| +N followers | PASS |
| Nuevo copy créditos | PASS |
| Icono crédito | PASS |
| Crédito se reserva al enviar | PASS |
| Crédito se consume al aceptar | PASS |
| Crédito se libera al rechazar | PASS |
| Crédito se libera al vencer 48h | PASS |
| Sin double-spend | PASS |
| Contacto privado antes de aceptar | PASS |
| Desbloqueo inmediato al aceptar | PASS |
| Sólo canales autorizados | PASS |
| Snapshot de contacto | PASS |
| RLS del snapshot | PASS |
| Cambio posterior no altera snapshot | PASS |
| /contactos mejorado | PASS |
| Recibidas | PASS |
| Enviadas | PASS |
| Vencidas | PASS |
| Contactos aceptados | PASS |
| Projects V0 | PASS |
| Project URL propia | PASS |
| Project privado por defecto | PASS |
| Project form | PASS |
| Taxonomía compatible con Preferences | PASS |
| Adjuntar Project | PASS |
| Crear Project desde Contactar | PASS |
| Snapshot Project en request | PASS |
| Notifications dropdown | PASS |
| Unread badge | PASS |
| Request notifications | PASS |
| Follow notification | PASS |
| Expiring notification | PASS |
| Botón global + | PASS |
| Proyecto desde + | PASS |
| Locación desde + | PASS |
| Servicio o Próximamente | PASS |
| Desktop sin regresiones | PASS |
| Mobile sin regresiones | PASS |
| Reel sin regresiones | PASS |
| Videos sin regresiones | PASS |
| Book sin regresiones | PASS |
| /talento sin regresiones | PASS |
| Auth real Test | PASS |
| RLS real Test | PASS |
| Production intacto | PASS |
| Worktree limpio | PASS |
