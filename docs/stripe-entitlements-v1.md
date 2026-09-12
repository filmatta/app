# FILMATTA — Stripe + Entitlements V1 (solo pruebas)

## Estado y preflight observado

Revisión del 11 de septiembre de 2026, aproximadamente 20:03 America/Mexico_City.

- Repositorio `G:\PROYECTOS\filmatta`, `main` limpio antes de editar. HEAD y remoto: `d5d5133eb4dd43c89cd800d297e0048f53937dc6`.
- [Vercel producción](https://vercel.com/filmatta/app/6FEqMzra3xjauKBKtQXjweh2U9wk): **Ready**, **Production**, **Current**, mismo commit. Inicio, catálogo y temario de un curso cargaron en `https://app-filmatta.vercel.app`. Logs del despliegue: cero errores/fatales en los últimos 30 minutos; solicitudes a cuenta y lecciones con 200. Esto no sustituye una prueba autenticada de reproducción.
- Equipo Vercel **Hobby**. Su uso se limita a proyectos personales no comerciales; resolver el plan antes de una operación comercial. No se cambió ningún plan. [Documentación](https://vercel.com/docs/plans/hobby).
- Stripe conectado en **Entorno de prueba de FILMATTA**, cuenta `acct_1UEgEC19oXDbxLYe`, URL con `/test/`. Dashboard muestra claves con prefijos de prueba; no se revelaron ni copiaron. No se ha probado la autenticación del servidor contra la API.
- Catálogo vacío: faltan ambos productos/precios. Tasas impositivas de prueba vacías. Workbench sin destinos de webhook. Portal accesible para configurar; no se guardó configuración ni se activó un enlace.
- La guía de Stripe sugiere Connect; no se configuró. Las suscripciones son ventas propias de FILMATTA, sin cuentas conectadas, comisiones ni transferencias a terceros.
- No hay variables Stripe en `.env.local`. No se modificaron credenciales, variables Vercel ni bases de datos. El país legal y la activación comercial de la cuenta siguen sin verificarse; Checkout exige `account.country = MX`.
- Usuario eligió **$299 Plus y $499 Pro MXN por mes, IVA incluido** para pruebas. Se propone una tasa manual inclusiva de 16% exclusivamente como escenario de prueba. La clasificación fiscal, obligaciones, exenciones y tratamiento definitivo requieren revisión antes de cualquier lanzamiento live. Stripe Tax admite operaciones domésticas mexicanas, pero no se activó. [Soporte de México](https://docs.stripe.com/tax/supported-countries/latin-america-and-caribbean/collect-tax?tax-jurisdiction-latin-america=mexico).

## Comportamiento implementado

- Stripe SDK `22.6.2`, API fijada en `2026-08-26.dahlia`. Rechazo de claves live, eventos live y eventos Connect. `VERCEL_ENV=production` deshabilita todo Billing, incluso si se activa la bandera por error.
- `BILLING_ENABLED` ausente/false conserva el acceso gratuito y los placeholders originales; no consulta tablas nuevas para autorizar Learn.
- Plus y Pro conceden la misma capacidad V1: `learn_regular`. Pro conserva su identidad de plan, sin implementar funciones profesionales futuras. `courses.billing_access='separate'` excluye especialidades; el valor predeterminado para el catálogo actual es `regular`.
- Cursos: usuario autenticado + curso/módulo/lección publicados + inscripción vigente + preview o permiso premium vigente. Admin mantiene su acceso existente. Guías regulares: permiso premium sin inscripción; su progreso sigue fuera de alcance.
- Autorización comprobada antes de consultar video y emitir tokens Mux. No se cambia Mux, su webhook, políticas de playback, expiración de tokens ni firmas. Un token ya emitido conserva su TTL existente (hasta 4 horas); la revocación impide emitir nuevos tokens, no invalida los anteriores.
- Nuevos RPC de progreso comprueban permisos en PostgreSQL; los RPC gratuitos existentes se conservan. Para completar un curso deben estar completas **todas** sus lecciones publicadas, incluidas las premium.
- Billing separa clientes, suscripciones, facturas Stripe, pagos, eventos y permisos de `course_enrollments` y `lesson_progress`. No se modifican inscripciones desde webhooks.
- Importe en unidades menores enteras; moneda `mxn`. `billing_profile_id` nullable y `fiscal_invoice_status='not_implemented'` reservan extensión futura. Una factura/recibo Stripe no es CFDI. No hay PAC, timbrado ni captura de RFC.
- Sesión Checkout creada por Server Action autenticada. Precio elegido por allowlist del servidor; no se aceptan customer/user/price IDs del navegador. Solo tarjeta, mensual, cantidad 1, moneda fija sin Adaptive Pricing, sin pruebas gratuitas ni códigos promocionales.
- Una suscripción existente, incluso `past_due` o `incomplete`, bloquea otra compra. Sesión abierta del mismo plan se reutiliza; otra selección espera a que expire (30 minutos). Clientes usan clave de idempotencia por usuario; Checkout y webhook comparten un bloqueo por cliente.
- `/cuenta/suscripcion` muestra estado de prueba y acceso efectivo. La URL de retorno **no concede permisos**. Portal requiere configuración explícita y propietario autenticado; V1 permite cancelar y actualizar método de pago, pero rechaza configuraciones que permitan cambiar plan o dirección de facturación. No se abre un enlace de portal anónimo.

## Webhooks y política de acceso

Endpoint nuevo: `POST /api/stripe/webhooks`. El proxy omite únicamente este endpoint nuevo, porque se autentica con firma Stripe sobre el cuerpo original. Mux y Auth conservan sus rutas.

Cada evento válido resuelve el cliente, verifica el vínculo guardado con Supabase y toma una lease de 120 segundos. Dentro de esa lease consulta el estado actual de Stripe, nunca confía en el estado histórico del payload. Una función SQL guarda registros, reemplaza los permisos de ese cliente y registra el evento **en una transacción**. Lease vencida o error devuelve 500; no se marca el evento como procesado. Stripe debe reintentarlo. No hay tarea en segundo plano después de responder 200.

`billing_events.stripe_event_id` evita duplicados; la reconciliación de estado actual evita que un evento antiguo restaure acceso cancelado. El límite de la ruta es 60 segundos. Si la respuesta Stripe supera una página de 100 objetos o la lease vence, se rechaza el procesamiento y se requiere revisión; no se acepta una reconciliación parcial.

Acceso solo con suscripción `active`, sin pausa de cobro, precio reconocido, última factura pagada con tarjeta y país MX tanto en cliente/factura como en el cargo. El vencimiento es el mínimo entre el periodo de la suscripción y el periodo recurrente no prorrateado pagado. Sin factura pagada no hay acceso, aunque Stripe diga `active`. No se admite pago fuera de Stripe, saldo gratuito ni trial en V1.

- Cancelación al final del periodo: acceso hasta el vencimiento pagado.
- Cancelación inmediata, `past_due`, `unpaid`, pausa o pago inicial incompleto: sin nuevos permisos.
- Pago recuperado: restaura acceso tras webhook.
- Reembolso total del pago actual o disputa abierta/perdida: revoca. Reembolso parcial: conserva. Disputa ganada/cerrada sin pérdida: se puede restaurar con el estado actual. Reembolso de un periodo histórico no elimina un periodo posterior pagado.
- Cliente eliminado: revoca sus permisos.
- Si un webhook se pierde, la fecha de vencimiento impide acceso indefinido. Para reparar el estado, reenviar el evento fallido desde Workbench; no editar permisos manualmente.

## Configuración pendiente, en orden

### 1. Supabase de pruebas

Crear o seleccionar un proyecto **separado del Supabase de producción**, con usuarios de prueba y contenido/metadata Mux para pruebas. No copiar datos personales de producción por defecto. Preparar Auth, tablas base, roles, helpers y las migraciones Learn existentes antes de estas dos migraciones nuevas.

Revisar manualmente estos archivos, que **no se ejecutaron**:

1. `supabase/migrations/20260912010000_billing_test_foundation.sql`
2. `supabase/migrations/20260912020000_entitled_lesson_progress.sql`

La primera agrega `courses.billing_access`, siete tablas Billing, RLS, grants mínimos y RPC solo para service role. La segunda agrega dos RPC de progreso sin reemplazar los existentes. Requieren `auth.users`, `auth.uid()`, tablas Learn, `private` y las migraciones previas. La revisión debe comprobar ownership de funciones `security definer` y que usuarios normales no tengan privilegios de escritura heredados.

Después de aprobar y aplicar manualmente ambas **solo en pruebas**, revisar el catálogo: marcar especialidades con `billing_access='separate'`. Activación SQL manual, únicamente en ese proyecto de pruebas:

```sql
-- Confirmar el proyecto antes de ejecutar. No se ejecutó durante esta tarea.
update public.billing_settings set test_access_enabled = true where id = true;
```

Para desactivar permisos de pruebas en DB: cambiar ese valor a false. Las tablas nuevas tienen RLS; clientes autenticados solo leen sus propios registros y no pueden sincronizar eventos, alterar suscripciones ni otorgarse permisos. Probar con dos usuarios: cada uno debe ver solo sus datos y cualquier intento de INSERT/UPDATE/DELETE o RPC de sincronización con su token debe fallar.

### 2. Stripe — permanecer en el entorno de prueba

En el catálogo crear dos productos activos, con **un precio recurrente mensual fijo/licensed**, sin trial, cantidad 1:

| Producto | Precio | Moneda | Intervalo | Impuesto incluido |
|---|---:|---|---|---|
| FILMATTA Plus | 299.00 (29900 centavos) | MXN | mes, cada 1 | Sí |
| FILMATTA Pro | 499.00 (49900 centavos) | MXN | mes, cada 1 | Sí |

Copiar sus IDs `price_…` a las variables del servidor. No inventarlos ni usar IDs live. Crear una tasa **manual de prueba**: nombre IVA, porcentaje 16, país MX, inclusiva, activa. Copiar su ID `txr_…`. Checkout valida estos atributos; los totales serán $299/$499, no esos importes más IVA. No activar automatic tax además de esta tasa.

**México solamente:** hosted Checkout permite elegir otros países de facturación; `shipping_address_collection.allowed_countries` no soluciona esto para servicios digitales. Esta V1 requiere validar una regla Radar que bloquee país de facturación ausente o distinto de MX antes de activar Checkout:

```text
Block if is_missing(:billing_address_country:) or :billing_address_country: != 'MX'
```

Verificar en el sandbox que la regla esté disponible, se aplique a pagos iniciales y renovaciones, y no haya reglas Allow que la anulen. Esto usa domicilio de facturación declarado, no nacionalidad, IP ni país emisor de tarjeta. Probar dirección MX (permitida), US (bloqueada) y país ausente (bloqueado). El webhook además deniega acceso si el país no coincide. Si Radar no permite esta regla en el plan/cuenta, **mantener `BILLING_MX_CHECKOUT_VERIFIED=false`**; no activar un plan de pago adicional sin decisión del propietario. Hace falta resolver ese bloqueo o diseñar otra captura/confirmación antes de probar Checkout end-to-end. [Atributos](https://docs.stripe.com/radar/rules/supported-attributes), [reglas y orden](https://docs.stripe.com/radar/rules/reference).

Configurar el portal de prueba: historial de facturas y actualización de métodos de pago; cancelación al final del periodo; deshabilitar cambio de plan y actualización de información/domicilio del cliente. Guardar, obtener ID `bpc_…` y ponerlo en la variable correspondiente. Mantener actualizaciones entre Plus/Pro fuera de V1; cancelar y esperar el fin del periodo antes de contratar otro plan. El código verifica las restricciones al abrir el portal.

### 3. Variables del servidor, solo Local/Preview

No pegar secretos en chat. Introducirlos directamente en `.env.local` ignorado por Git o Vercel → Settings → Environment Variables → **Preview**, con filtro a la rama de pruebas. No marcar Production. Los IDs no son secretos, las claves y firmas sí lo son.

| Variable | Valor requerido |
|---|---|
| `BILLING_ENABLED` | `false` hasta completar setup; luego `true` en pruebas |
| `BILLING_MODE` | `test` |
| `BILLING_APP_URL` | Origen exacto sin barra final: `http://localhost:3000` o HTTPS estable del Preview |
| `BILLING_TEST_SUPABASE_PROJECT_REF` | Referencia del proyecto Supabase separado de pruebas |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de ese mismo proyecto de pruebas |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública del proyecto de pruebas |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privilegiada del proyecto de pruebas, solo servidor |
| `STRIPE_SECRET_KEY` | Clave `sk_test_…` del entorno; o `rk_test_…` con permisos mínimos suficientes |
| `STRIPE_TEST_ACCOUNT_ID` | `acct_1UEgEC19oXDbxLYe` para el entorno observado |
| `STRIPE_PLUS_PRICE_ID` / `STRIPE_PRO_PRICE_ID` | IDs reales de los dos precios de prueba |
| `STRIPE_MX_TAX_RATE_ID` | Tasa inclusiva de prueba `txr_…` |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Configuración de portal de prueba `bpc_…` |
| `STRIPE_WEBHOOK_SECRET` | Secreto `whsec_…` del destino exacto o del listener local |
| `BILLING_MX_CHECKOUT_VERIFIED` | `false` hasta verificar los tres casos de país; después `true` |

El SDK necesita leer cuenta, precios/productos, tasas, clientes, suscripciones, sesiones Checkout, facturas, invoice payments, cargos, disputas y configuración de portal; y crear clientes, sesiones Checkout y sesiones del portal. No requiere permisos Connect/transferencias. No hace falta clave publicable Stripe para el Checkout alojado.

Configurar en Auth del Supabase de pruebas la Site URL y redirect URLs de localhost y del Preview. Reutilizar la configuración Mux necesaria en pruebas sin alterar la de producción.

### 4. Destino de webhooks

Local: con Stripe CLI autenticada **en el mismo entorno de prueba**, ejecutar:

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhooks
```

Poner el secreto del listener en `STRIPE_WEBHOOK_SECRET` local y reiniciar el servidor. El secreto del Dashboard no sustituye al del listener.

Preview: después de que el propietario revise y despliegue el código, elegir un hostname HTTPS estable (no la URL única de cada build). En Stripe Workbench → Añadir destino → **Tu cuenta**, seleccionar eventos snapshot y versión **2026-08-26.dahlia**. Destino: `https://HOST-PREVIEW/api/stripe/webhooks`. Nunca registrar el endpoint de producción para esta V1: devuelve 503 allí deliberadamente.

Eventos a seleccionar:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
customer.updated
customer.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.finalization_failed
invoice.voided
invoice.marked_uncollectible
charge.refunded
charge.dispute.created
charge.dispute.closed
```

Guardar el secreto del destino en Preview y redesplegar. No seleccionar `invoice.created`: la integración no necesita intervenir en finalización. El endpoint debe ser alcanzable por Stripe; si Vercel Deployment Protection responde con login, usar listener local o una excepción autorizada para el destino de prueba. No se desactivó protección durante esta tarea. No poner bypass tokens en documentación, Git ni chat.

### 5. Validación de aceptación pendiente con proveedores

No se realizaron cobros ni se ejecutaron migraciones. Las pruebas automatizadas usan Stripe/DB simulados en los límites de red; validan módulos reales y firmas reales generadas con datos ficticios. **No demuestran que el SQL se haya aplicado ni que RLS haya sido probado en Supabase.**

Con el setup completo probar: Plus y Pro exitosos; pago rechazado; 3DS; doble click/reintento; retorno Checkout antes del webhook; renovación con Test Clock; impago y recuperación; cancelación inmediata y al final del periodo; refund total/parcial; disputa; replay duplicado y fuera de orden; webhook con firma incorrecta; país MX/US/ausente; claves/objetos live rechazados; dos usuarios aislados por RLS; bloqueo premium tras vencimiento; inscripción gratuita sin suscripción; guías regulares y especialidades; Learn/Mux/auth, móvil y cuenta.

Usar únicamente tarjetas de prueba de [Stripe](https://docs.stripe.com/testing). Revisar `billing_events`, `billing_invoices`, `billing_payments`, `billing_subscriptions`, `billing_entitlements` y Workbench, además de la interfaz. No usar `stripe trigger` aislado como única prueba: puede crear clientes sin vínculo con el usuario y esos eventos se ignoran deliberadamente.

Comandos locales:

```powershell
npm run test:billing
npm run lint
npm run build
git diff --check
```

No se hizo commit, push, despliegue ni publicación. La habilitación live, CFDI/PAC, cambios de plan/prorrateos, Connect y pagos marketplace requieren trabajo posterior.

## Validación ejecutada

- `npm run test:billing`: 8 pruebas aprobadas. Incluyen autorización, vencimiento, claves live/Production rechazadas, firmas, reintentos, duplicados, cancelación fuera de orden, impago, refund, aislamiento del vínculo de cliente y prevención de checkout duplicado.
- `npm run lint`: 0 errores, 5 advertencias `<img>` preexistentes.
- `npm run build`: correcto, 22 rutas/páginas en el resumen de Next.js; TypeScript correcto.
- `git diff --check` y revisión equivalente de archivos nuevos: limpios.
- Smoke del build local con Billing deshabilitado: `/planes` devuelve 200 sin botones de prueba; `/cuenta/suscripcion` sin sesión emite redirección de Next hacia acceso y no incluye formulario; webhook Stripe devuelve 503 `Billing disabled`. Servidor temporal detenido al terminar.
- SQL preparado y revisado como texto; **no ejecutado en ninguna base de datos**. Validación RLS y pagos reales del sandbox pendientes del setup anterior.
