-- REVIEW ONLY. Do not apply to the production database for sandbox testing.
begin;

alter table public.courses add column billing_access text not null default 'regular'
  check (billing_access in ('regular', 'separate'));
comment on column public.courses.billing_access is 'Separate/specialty content is excluded from Plus and Pro.';

create table public.billing_settings (
  id boolean primary key default true check (id),
  test_access_enabled boolean not null default false
);
insert into public.billing_settings default values;

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  stripe_customer_id text not null unique check (stripe_customer_id like 'cus_%'),
  mode text not null default 'test' check (mode = 'test'),
  billing_profile_id uuid, -- Reserved; no RFC/CFDI/PAC integration in V1.
  lock_token uuid,
  lock_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.billing_subscriptions (
  stripe_subscription_id text primary key,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id),
  mode text not null default 'test' check (mode = 'test'),
  plan text check (plan in ('plus','pro')),
  stripe_price_id text,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_id_customer_unique
    unique (stripe_subscription_id, stripe_customer_id)
);
create index billing_subscriptions_customer_idx on public.billing_subscriptions(stripe_customer_id);
create table public.billing_invoices (
  stripe_invoice_id text primary key,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id),
  stripe_subscription_id text,
  mode text not null default 'test' check (mode = 'test'),
  status text,
  currency text not null check (currency = 'mxn'),
  amount_due bigint not null,
  amount_paid bigint not null,
  subtotal bigint not null,
  total bigint not null,
  tax bigint not null,
  billing_country text,
  fiscal_invoice_status text not null default 'not_implemented' check (fiscal_invoice_status = 'not_implemented'),
  billing_profile_id uuid,
  updated_at timestamptz not null default now(),
  constraint billing_invoices_id_customer_unique
    unique (stripe_invoice_id, stripe_customer_id),
  constraint billing_invoices_subscription_customer_fk
    foreign key (stripe_subscription_id, stripe_customer_id)
    references public.billing_subscriptions (stripe_subscription_id, stripe_customer_id)
    on update restrict
    on delete restrict
);
comment on table public.billing_invoices is 'Stripe accounting records, never CFDI. Amounts are integer minor units.';
create index billing_invoices_customer_idx on public.billing_invoices(stripe_customer_id);
create table public.billing_payments (
  stripe_invoice_payment_id text primary key,
  stripe_invoice_id text not null,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id),
  mode text not null default 'test' check (mode = 'test'),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  status text not null,
  amount_paid bigint not null,
  amount_refunded bigint not null default 0,
  disputed boolean not null default false,
  currency text not null check (currency = 'mxn'),
  updated_at timestamptz not null default now(),
  constraint billing_payments_invoice_customer_fk
    foreign key (stripe_invoice_id, stripe_customer_id)
    references public.billing_invoices (stripe_invoice_id, stripe_customer_id)
    on update restrict
    on delete restrict
);
create index billing_payments_customer_idx on public.billing_payments(stripe_customer_id);
create table public.billing_entitlements (
  stripe_subscription_id text primary key,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id),
  mode text not null default 'test' check (mode = 'test'),
  feature text not null default 'learn_regular' check (feature = 'learn_regular'),
  plan text not null check (plan in ('plus','pro')),
  valid_until timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint billing_entitlements_subscription_customer_fk
    foreign key (stripe_subscription_id, stripe_customer_id)
    references public.billing_subscriptions (stripe_subscription_id, stripe_customer_id)
    on update restrict
    on delete restrict
);
create index billing_entitlements_customer_idx on public.billing_entitlements(stripe_customer_id, valid_until);
create table public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  mode text not null default 'test' check (mode = 'test'),
  processed_at timestamptz not null default now()
);

-- No browser/admin-role writes. Only the existing server service role may sync.
alter table public.billing_settings enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_settings, public.billing_customers, public.billing_subscriptions,
  public.billing_invoices, public.billing_payments, public.billing_entitlements, public.billing_events
  from public, anon, authenticated;
grant all on public.billing_settings, public.billing_customers, public.billing_subscriptions,
  public.billing_invoices, public.billing_payments, public.billing_entitlements, public.billing_events to service_role;
grant select (plan, status, current_period_end, cancel_at_period_end, updated_at)
  on public.billing_subscriptions to authenticated;
grant select (status, currency, amount_due, amount_paid, subtotal, total, tax,
  billing_country, fiscal_invoice_status, updated_at)
  on public.billing_invoices to authenticated;
grant select (status, amount_paid, amount_refunded, disputed, currency, updated_at)
  on public.billing_payments to authenticated;

create function private.owns_billing_customer(p_customer text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.billing_customers
    where stripe_customer_id = p_customer
      and user_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_billing_customer(text) from public, anon, authenticated;
grant execute on function private.owns_billing_customer(text) to authenticated;

create policy billing_customers_own_read on public.billing_customers for select to authenticated
  using (user_id = (select auth.uid()));
create policy billing_subscriptions_own_read on public.billing_subscriptions for select to authenticated
  using ((select private.owns_billing_customer(stripe_customer_id)));
create policy billing_invoices_own_read on public.billing_invoices for select to authenticated
  using ((select private.owns_billing_customer(stripe_customer_id)));
create policy billing_payments_own_read on public.billing_payments for select to authenticated
  using ((select private.owns_billing_customer(stripe_customer_id)));
create policy billing_entitlements_own_read on public.billing_entitlements for select to authenticated
  using ((select private.owns_billing_customer(stripe_customer_id)));

create function public.get_my_billing_plan() returns text
language sql stable security definer set search_path = '' as $$
  select e.plan from public.billing_entitlements e
  join public.billing_customers c using (stripe_customer_id)
  where c.user_id = (select auth.uid()) and e.valid_until > now()
    and (select test_access_enabled from public.billing_settings where id)
  order by (e.plan = 'pro') desc limit 1;
$$;
revoke all on function public.get_my_billing_plan() from public, anon, authenticated;
grant execute on function public.get_my_billing_plan() to authenticated;

-- Shared lease serializes Checkout and canonical webhook reconciliation. A stale
-- worker cannot commit after its lease expires, even if another worker reclaimed it.
create function public.claim_billing_customer(p_customer text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare token uuid;
begin
  update public.billing_customers set lock_token = gen_random_uuid(), lock_until = now() + interval '120 seconds'
    where stripe_customer_id = p_customer and (lock_until is null or lock_until < now())
    returning lock_token into token;
  return token;
end;
$$;
create function public.release_billing_customer(p_customer text, p_token uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.billing_customers set lock_token = null, lock_until = null
    where stripe_customer_id = p_customer and lock_token = p_token;
$$;

create function public.apply_billing_snapshot(p_customer text, p_token uuid, p_event text,
  p_event_type text, p_subscriptions jsonb, p_invoices jsonb, p_payments jsonb, p_entitlements jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  row_data jsonb;
  referenced_id text;
begin
  perform 1 from public.billing_customers where stripe_customer_id = p_customer
    and lock_token = p_token and lock_until > now() for update;
  if not found then raise exception 'Billing lease expired'; end if;

  if jsonb_typeof(p_subscriptions) is distinct from 'array'
    or jsonb_typeof(p_invoices) is distinct from 'array'
    or jsonb_typeof(p_payments) is distinct from 'array'
    or jsonb_typeof(p_entitlements) is distinct from 'array' then
    raise exception 'Billing snapshot collections must be JSON arrays' using errcode = '22023';
  end if;

  -- Validate the complete snapshot before recording the event. A duplicate event
  -- remains a no-op only when its object identities still belong to this customer.
  for row_data in select value from jsonb_array_elements(p_subscriptions) loop
    referenced_id := nullif(row_data->>'id', '');
    if referenced_id is null then
      raise exception 'Billing subscription ID is required' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.billing_subscriptions
      where stripe_subscription_id = referenced_id and stripe_customer_id <> p_customer
    ) then
      raise exception 'Stripe subscription % is already associated with another customer', referenced_id
        using errcode = '23514';
    end if;
  end loop;

  for row_data in select value from jsonb_array_elements(p_invoices) loop
    referenced_id := nullif(row_data->>'id', '');
    if referenced_id is null then
      raise exception 'Billing invoice ID is required' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.billing_invoices
      where stripe_invoice_id = referenced_id and stripe_customer_id <> p_customer
    ) then
      raise exception 'Stripe invoice % is already associated with another customer', referenced_id
        using errcode = '23514';
    end if;

    referenced_id := nullif(row_data->>'subscription', '');
    if referenced_id is not null
      and not exists (
        select 1 from public.billing_subscriptions
        where stripe_subscription_id = referenced_id and stripe_customer_id = p_customer
      )
      and not exists (
        select 1 from jsonb_array_elements(p_subscriptions) as candidate(value)
        where candidate.value->>'id' = referenced_id
      ) then
      raise exception 'Stripe invoice references subscription % outside the billing customer', referenced_id
        using errcode = '23514';
    end if;
  end loop;

  for row_data in select value from jsonb_array_elements(p_payments) loop
    referenced_id := nullif(row_data->>'id', '');
    if referenced_id is null then
      raise exception 'Billing payment ID is required' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.billing_payments
      where stripe_invoice_payment_id = referenced_id and stripe_customer_id <> p_customer
    ) then
      raise exception 'Stripe payment % is already associated with another customer', referenced_id
        using errcode = '23514';
    end if;

    referenced_id := nullif(row_data->>'invoice', '');
    if referenced_id is null then
      raise exception 'Billing payment invoice ID is required' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.billing_invoices
      where stripe_invoice_id = referenced_id and stripe_customer_id = p_customer
    )
      and not exists (
        select 1 from jsonb_array_elements(p_invoices) as candidate(value)
        where candidate.value->>'id' = referenced_id
      ) then
      raise exception 'Stripe payment references invoice % outside the billing customer', referenced_id
        using errcode = '23514';
    end if;
  end loop;

  for row_data in select value from jsonb_array_elements(p_entitlements) loop
    referenced_id := nullif(row_data->>'subscription', '');
    if referenced_id is null then
      raise exception 'Billing entitlement subscription ID is required' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.billing_entitlements
      where stripe_subscription_id = referenced_id and stripe_customer_id <> p_customer
    ) then
      raise exception 'Stripe entitlement subscription % is already associated with another customer', referenced_id
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.billing_subscriptions
      where stripe_subscription_id = referenced_id and stripe_customer_id = p_customer
    )
      and not exists (
        select 1 from jsonb_array_elements(p_subscriptions) as candidate(value)
        where candidate.value->>'id' = referenced_id
      ) then
      raise exception 'Billing entitlement references subscription % outside the billing customer', referenced_id
        using errcode = '23514';
    end if;
  end loop;

  insert into public.billing_events(stripe_event_id, event_type) values (p_event, p_event_type)
    on conflict do nothing;
  if not found then return; end if;
  if p_event_type = 'customer.deleted' then
    update public.billing_subscriptions set status='canceled', updated_at=now()
      where stripe_customer_id=p_customer;
  end if;
  for row_data in select value from jsonb_array_elements(p_subscriptions) loop
    referenced_id := row_data->>'id';
    insert into public.billing_subscriptions(stripe_subscription_id, stripe_customer_id, plan,
      stripe_price_id, status, current_period_end, cancel_at_period_end)
    values (referenced_id, p_customer, row_data->>'plan', row_data->>'price', row_data->>'status',
      (row_data->>'period_end')::timestamptz, (row_data->>'cancel_at_period_end')::boolean)
    on conflict (stripe_subscription_id) do update set plan=excluded.plan, stripe_price_id=excluded.stripe_price_id,
      status=excluded.status, current_period_end=excluded.current_period_end,
      cancel_at_period_end=excluded.cancel_at_period_end, updated_at=now()
      where billing_subscriptions.stripe_customer_id = p_customer;
    if not found then
      raise exception 'Stripe subscription % changed billing customer during reconciliation', referenced_id
        using errcode = '23514';
    end if;
  end loop;
  for row_data in select value from jsonb_array_elements(p_invoices) loop
    referenced_id := row_data->>'id';
    insert into public.billing_invoices(stripe_invoice_id, stripe_customer_id, stripe_subscription_id,
      status, currency, amount_due, amount_paid, subtotal, total, tax, billing_country)
    values (referenced_id,p_customer,nullif(row_data->>'subscription',''),row_data->>'status',row_data->>'currency',
      (row_data->>'amount_due')::bigint,(row_data->>'amount_paid')::bigint,(row_data->>'subtotal')::bigint,
      (row_data->>'total')::bigint,(row_data->>'tax')::bigint,row_data->>'country')
    on conflict (stripe_invoice_id) do update set stripe_subscription_id=excluded.stripe_subscription_id,
      status=excluded.status, amount_paid=excluded.amount_paid,
      amount_due=excluded.amount_due, subtotal=excluded.subtotal, total=excluded.total, tax=excluded.tax,
      billing_country=excluded.billing_country, updated_at=now()
      where billing_invoices.stripe_customer_id = p_customer;
    if not found then
      raise exception 'Stripe invoice % changed billing customer during reconciliation', referenced_id
        using errcode = '23514';
    end if;
  end loop;
  for row_data in select value from jsonb_array_elements(p_payments) loop
    referenced_id := row_data->>'id';
    insert into public.billing_payments(stripe_invoice_payment_id, stripe_invoice_id, stripe_customer_id,
      stripe_payment_intent_id,stripe_charge_id,status,amount_paid,amount_refunded,disputed,currency)
    values (referenced_id,row_data->>'invoice',p_customer,row_data->>'intent',row_data->>'charge',
      row_data->>'status',(row_data->>'amount_paid')::bigint,(row_data->>'amount_refunded')::bigint,
      (row_data->>'disputed')::boolean,row_data->>'currency')
    on conflict (stripe_invoice_payment_id) do update set stripe_invoice_id=excluded.stripe_invoice_id,
      status=excluded.status, amount_paid=excluded.amount_paid,
      stripe_payment_intent_id=excluded.stripe_payment_intent_id, stripe_charge_id=excluded.stripe_charge_id,
      amount_refunded=excluded.amount_refunded, disputed=excluded.disputed, updated_at=now()
      where billing_payments.stripe_customer_id = p_customer;
    if not found then
      raise exception 'Stripe payment % changed billing customer during reconciliation', referenced_id
        using errcode = '23514';
    end if;
  end loop;
  -- Replace only this customer's grants, in the same transaction as all records.
  delete from public.billing_entitlements where stripe_customer_id = p_customer;
  for row_data in select value from jsonb_array_elements(p_entitlements) loop
    referenced_id := row_data->>'subscription';
    insert into public.billing_entitlements(stripe_subscription_id,stripe_customer_id,plan,valid_until)
      values (referenced_id,p_customer,row_data->>'plan',(row_data->>'valid_until')::timestamptz)
    on conflict (stripe_subscription_id) do update set plan=excluded.plan,
      valid_until=excluded.valid_until, updated_at=now()
      where billing_entitlements.stripe_customer_id = p_customer;
    if not found then
      raise exception 'Stripe entitlement subscription % changed billing customer during reconciliation', referenced_id
        using errcode = '23514';
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_billing_customer(text), public.release_billing_customer(text,uuid),
  public.apply_billing_snapshot(text,uuid,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_billing_customer(text), public.release_billing_customer(text,uuid),
  public.apply_billing_snapshot(text,uuid,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
