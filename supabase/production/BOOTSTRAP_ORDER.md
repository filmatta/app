# FILMATTA Production Supabase bootstrap

Apply these files manually, in this exact order, to the dedicated Production
project. Run each complete file and stop on the first error.

1. `supabase/production/verify_bootstrap_state.sql` (read-only preflight)
2. `supabase/production/0001_core_learn_prerequisites.sql`
3. `supabase/migrations/20260909030000_create_learn_content.sql`
4. `supabase/migrations/20260909040000_create_enrollments_and_learning_analytics.sql`
5. `supabase/migrations/20260909050000_create_lesson_progress.sql`
6. `supabase/migrations/20260910010000_add_course_content_type.sql`
7. `supabase/migrations/20260910020000_set_lesson_video_access.sql`
8. `supabase/migrations/20260910030000_grant_mux_webhook_service_role_columns.sql`
9. `supabase/production/billing_live_foundation.sql`
10. `supabase/migrations/20260912020000_entitled_lesson_progress.sql`
11. `supabase/production/verify_bootstrap_state.sql` (read-only postflight)

Do not apply these Test or superseded files to Production:

- `20260912010000_billing_test_foundation.sql`
- `20260914010000_persist_scheduled_cancellation.sql`
- `20260914020000_admin_plan_grants.sql`

The Live foundation already contains the final scheduled-cancellation and
Admin Grant schema. Applying the latter two again would duplicate objects.

The bootstrap intentionally creates no application users, course rows,
enrollments, lesson progress, Mux assets, billing customers, Stripe objects,
entitlements, invoices, payments, events, Admin Grants, or QA fixtures.

After the postflight succeeds, verify separately that the single settings row
still has `live_access_enabled = false`:

```sql
select id, live_access_enabled
from public.billing_settings;
```

Do not enable it until Stripe Live webhook reconciliation has been verified.
