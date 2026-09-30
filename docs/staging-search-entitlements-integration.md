# Integración de staging: Profiles Search V1 + Entitlements Foundation V1

Fecha de validación: 2026-09-30.

## Trazabilidad

- Profiles Search V1 original: `d21eac099c63ac99526276298039661c90b0f7f7`.
- Fix de versión de Search integrado: `5ba8a686fe03881ed860cba4570218cc5100f24f`.
- Entitlements Foundation V1 original: `cfb79c00adfc1d7e94a8b5068c75dcbb8605e0a2`.
- Fix de versión de Entitlements fuente: `adec31f`.
- Rama conjunta: `codex/staging-search-entitlements-integration`.

La migración de Search no conserva el número `20260930010000` indicado en el
encargo porque ese número ya pertenecía a Writer en el historial disponible.
Search ya había sido corregida y aplicada en Test como `20260930040000`. La
migración de Entitlements usa `20260930050000`, posterior a Search y al alias
de editor `20260930041000` ya presente en Test. El SQL de Entitlements no cambió
durante el rename.

## Entorno remoto

- Supabase Test/Preview: `ezlycwkuzkwcnhrhiruv`.
- Supabase Production excluido: `ihryubbegljbwmuyazbn`.
- `BILLING_MODE=test` y la URL configurada corresponden al proyecto Test.
- Se aplicó solamente `20260930050000_entitlements_foundation_v1.sql` a Test.
- El historial remoto confirmó Search `300400`, alias `300410` y Entitlements
  `300500` en ese orden.

No se ejecutó `supabase db reset`: el entorno local no dispone de Docker y la
base Test es compartida, por lo que resetearla sería destructivo. El equivalente
seguro usado fue auditoría completa de versiones, suites SQL/locales, compilación,
aplicación de la migración pendiente a Test y comprobaciones remotas posteriores.

## Resultado

- No hay versiones duplicadas en las 65 migraciones de la rama conjunta.
- Search conserva documento `tsvector`, GIN parcial, índices, RPC y filtros;
  los borradores permanecen excluidos.
- Entitlements conserva tablas, RLS, grants, aliases y fallback `free`.
- Una prueba opt-in contra Test cubre búsqueda, filtros, paginación, RLS y la
  resolución efectiva de `free`, `starter`, `plus`, `pro` y `pro_plus`.
- Los datos sintéticos de la prueba se eliminan al finalizar.
- Search no tiene gates comerciales y no se añadió Checkout ni Stripe.
