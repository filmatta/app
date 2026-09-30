# Entitlements Foundation V1

## Objetivo

Entitlements Foundation separa las capacidades del producto de la fuente que
otorga un plan. Stripe/Billing histórico se conserva, pero ya no es la capa que
define qué puede hacer una persona.

El orden autoritativo es:

1. grant explícito válido;
2. entitlement válido de Billing existente;
3. `free`/baseline.

Si el resolver falla, devuelve baseline con estado `unavailable`. La navegación
no muestra badge premium y `UpgradeGate` no convierte ese error en una venta.

## API de producto

Los entrypoints server-side viven en `lib/entitlements/server.ts`:

```ts
const plan = await getEffectivePlan();
const access = await checkEntitlement("search.project_matchmaking");
const allowed = await can("production.assistant");
const allowance = await getAllowance("writer.ai_credits");
const usage = await getUsage("writer.ai_credits");
```

Un check bloqueado devuelve, por ejemplo:

```ts
{
  allowed: false,
  currentPlan: "plus",
  requiredPlan: "pro",
  reason: "PLAN_LOCKED"
}
```

Las features protegidas deben autorizar en servidor con esta API. Los badges,
el modal y el estado React sólo presentan el resultado.

## Catálogo y herencia

`lib/entitlements/catalog.ts` concentra:

- planes y fallback de precios;
- keys semánticas;
- plan mínimo;
- allowances;
- copy de upgrade.

La migración crea `subscription_plans` y `plan_entitlements`. Cuando esas tablas
están disponibles, la app usa sus precios y overrides. El catálogo bundled
permite un rollout gradual y es el fallback versionado.

La jerarquía es:

`free → starter → plus → pro → pro_plus`

Los valores se heredan hacia arriba. Un override explícito posterior puede
permitir o denegar una excepción sin depender únicamente del ranking.

## Grants y Billing anterior

Se reutiliza `admin_plan_grants` como tabla canónica de grants explícitos para no
duplicar ni perder su auditoría. La migración añade `source`, `status` y
`metadata`, amplía los planes y conserva filas anteriores.

La asignación Admin inserta primero el plan nuevo y después revoca grants activos
anteriores. Nunca escribe en suscripciones, invoices, pagos o entitlements de
Stripe. En development/Preview la fuente queda registrada como `test`; en los
demás entornos, como `admin`.

`business` queda como alias de presentación/migración de `pro_plus`. No se borra
historial y no se presenta un quinto plan Business separado.

`getBillingAccess()` sigue disponible como adaptador temporal para Learn y los
flujos históricos de Billing. Delega al resolver central. No debe usarse para
features nuevas.

## Allowances y usage

`entitlement_usage` representa consumo por usuario, entitlement y periodo. Los
usuarios sólo pueden leer sus propias filas mediante RLS; no existe escritura
desde navegador. La integración del consumo real se hará en puntos server-side
seguros cuando cada producto defina su coste.

AI Credits, Search allowance y storage son allowances de plan. Contact Credits
no se renombran ni se mezclan con esta tabla.

## UI compartida

- `PlanBadge`: Starter slate, Plus verde, Pro ámbar y Pro+ azul. Baseline no se
  muestra por defecto.
- `FeaturePlanBadge`: indica el plan requerido, no el plan actual.
- `UpgradeGate`: recibe un `EntitlementCheck`, distingue plan, cuota, AI Credits,
  storage y unavailable, y abre un único modal accesible.
- `/planes`: consume el catálogo central y no inicia checkout.
- `/admin/planes`: simulación protegida por `requireAdmin()` para los cinco
  estados.

El modal usa `<dialog>`, por lo que Escape cierra de forma nativa; también ofrece
X y “Ahora no”. El CTA sólo navega a `/planes`.

## Rollout

1. Aplicar `20260930050000_entitlements_foundation_v1.sql` en Preview/Staging.
2. Validar los cinco estados desde `/admin/planes`.
3. Verificar RLS y `get_my_entitlement_context()` con cuentas autenticadas y una
   sesión anónima.
4. Integrar features nuevas exclusivamente mediante `checkEntitlement()`.
5. Mantener Billing histórico hasta que exista un proyecto separado de pagos.

Esta fase no añade Stripe Checkout, Customer Portal nuevo, webhooks, cobros,
tarjetas, invoices ni compras de boosts.
