-- READ ONLY. Safe to run before or after the Production bootstrap.
with expected_relations(object_name) as (
  values
    ('public.profiles'),
    ('public.courses'),
    ('public.course_modules'),
    ('public.course_lessons'),
    ('public.lesson_videos'),
    ('public.course_enrollments'),
    ('public.learning_events'),
    ('public.lesson_progress'),
    ('public.billing_settings'),
    ('public.billing_customers'),
    ('public.billing_subscriptions'),
    ('public.billing_invoices'),
    ('public.billing_payments'),
    ('public.billing_entitlements'),
    ('public.billing_events'),
    ('public.admin_plan_grants'),
    ('storage.buckets')
),
expected_functions(object_name, identity_arguments) as (
  values
    ('private.set_core_updated_at', ''),
    ('private.create_profile_for_new_user', ''),
    ('private.is_admin', ''),
    ('private.set_learn_updated_at', ''),
    ('private.validate_lesson_video_policy', ''),
    ('private.has_regular_course_access', 'uuid'),
    ('private.owns_billing_customer', 'text'),
    ('private.touch_admin_plan_grant_updated_at', ''),
    ('public.enroll_in_published_course', 'uuid'),
    ('public.get_admin_learn_stats', ''),
    ('public.start_preview_lesson', 'uuid, uuid'),
    ('public.complete_preview_lesson', 'uuid, uuid'),
    ('public.start_entitled_lesson', 'uuid, uuid'),
    ('public.complete_entitled_lesson', 'uuid, uuid'),
    ('public.get_my_billing_access', ''),
    ('public.get_my_billing_plan', ''),
    ('public.claim_billing_customer', 'text'),
    ('public.release_billing_customer', 'text, uuid'),
    ('public.apply_billing_snapshot', 'text, uuid, text, text, jsonb, jsonb, jsonb, jsonb'),
    ('public.set_lesson_video_access', 'uuid, boolean, text, text')
),
object_status as (
  select
    'relation'::text as object_type,
    relation.object_name,
    to_regclass(relation.object_name) is not null as exists
  from expected_relations as relation
  union all
  select
    'function'::text,
    expected_function.object_name || '(' || expected_function.identity_arguments || ')',
    to_regprocedure(
      expected_function.object_name || '(' || expected_function.identity_arguments || ')'
    ) is not null
  from expected_functions as expected_function
)
select object_type, object_name, exists
from object_status
order by object_type, object_name;

select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'courses',
    'course_modules',
    'course_lessons',
    'lesson_videos',
    'course_enrollments',
    'learning_events',
    'lesson_progress',
    'billing_settings',
    'billing_customers',
    'billing_subscriptions',
    'billing_invoices',
    'billing_payments',
    'billing_entitlements',
    'billing_events',
    'admin_plan_grants'
  )
order by table_name, ordinal_position;

select
  namespace.nspname as table_schema,
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p')
  and relation.relname in (
    'profiles',
    'courses',
    'course_modules',
    'course_lessons',
    'lesson_videos',
    'course_enrollments',
    'learning_events',
    'lesson_progress',
    'billing_settings',
    'billing_customers',
    'billing_subscriptions',
    'billing_invoices',
    'billing_payments',
    'billing_entitlements',
    'billing_events',
    'admin_plan_grants'
  )
order by table_name;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
  and tablename in (
    'profiles',
    'courses',
    'course_modules',
    'course_lessons',
    'lesson_videos',
    'course_enrollments',
    'learning_events',
    'lesson_progress',
    'billing_settings',
    'billing_customers',
    'billing_subscriptions',
    'billing_invoices',
    'billing_payments',
    'billing_entitlements',
    'billing_events',
    'admin_plan_grants',
    'objects'
  )
order by schemaname, tablename, policyname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'course-covers';
