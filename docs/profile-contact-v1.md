# Contacto Operativo V1 — Profiles + Talent

## Decisión de arquitectura

Profiles y Talent extienden `catalog_inquiries`, la bandeja privada ya usada por Services y Jobs. No existe una tabla ni un inbox separado para Talent. `profile_id`, `source_type`, motivo, lectura, una respuesta y archivo por participante se agregan de forma aditiva. V1 permite consulta inicial + una respuesta del propietario; no es chat, no usa realtime, websockets, adjuntos, presencia ni indicadores de escritura.

## Privacidad y autorización

El RPC deriva remitente desde `auth.uid()` y destinatario desde el slug público. Sólo acepta perfiles `is_public=true` con `contact_policy='members_only'`; rechaza auto-contacto con el mismo error genérico usado para perfiles cerrados, borradores o inexistentes. Los participantes pueden leer mediante RLS/RPC; terceros y anon no pueden. La identidad mínima del remitente se guarda como nombre profesional o una abreviatura segura del nombre de cuenta. Email, teléfono, WhatsApp y `auth.users.raw_user_meta_data` nunca aparecen en las proyecciones.

El archivo es individual mediante `sender_archived_at` / `recipient_archived_at`. Reportar crea `catalog_inquiry_reports`; la moderación administrativa completa queda para una fase posterior. Los reportes sólo son legibles por quien reporta o un admin.

## Anti-spam

- 10 consultas nuevas por usuario en 24 horas, compartidas con Services/Jobs.
- Una consulta al mismo perfil cada 7 días.
- Duplicado textual bloqueado durante 10 minutos.
- Mensajes y respuesta entre 20 y 3,000 caracteres.
- Una única respuesta interna en V1.
- Inserciones directas siguen revocadas; identidad, ownership y destino se calculan en SQL.
- No CAPTCHA mientras estos controles sean suficientes.

## Email

`CONTACT_EMAIL_NOTIFICATIONS_ENABLED=true` habilita el envío con `RESEND_API_KEY` y `CONTACT_EMAIL_FROM`, todos server-side. En Production se usa el email privado del destinatario sólo para la entrega. Fuera de Production, el correo se omite salvo que exista `CONTACT_EMAIL_TEST_RECIPIENT`; en ese caso todo se redirige exclusivamente a ese buzón seguro. El email incluye nombre seguro, contexto y CTA; no incluye el mensaje completo ni datos de contacto.

## UI

`/perfiles/[slug]` abre un `<dialog>` compacto. Un visitante conserva el retorno seguro a la ficha mediante login. El owner ve `Editar perfil`. `/cuenta/contactos` separa Recibidos y Enviados; `/cuenta/contactos/[id]` contiene detalle, respuesta única, archivo y reporte. La navegación añade Contactos a Mi cuenta. No se añadió badge global porque requeriría una consulta personal en cada header; queda para cuando exista una capa de notificaciones/cache común.

## Migración y release

Migración: `20260922010000_profile_contacts.sql`. Es aditiva, conserva consultas Services/Jobs, mantiene RLS y añade índices/constraints. Se aplica primero en Supabase Test. Para Production: auditar drift, aplicar exactamente esta migración, configurar variables server-side de email, desplegar el commit aprobado y ejecutar smoke con dos cuentas controladas; nunca enviar email Production durante QA.

El Preview de esta rama debe usar variables branch-scoped para `ezlycwkuzkwcnhrhiruv`. El envío de correo permanece desactivado durante QA; no se hereda Supabase Production ni se configura un destinatario real.
