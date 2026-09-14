begin;

alter table public.billing_subscriptions
  add column if not exists cancel_at timestamptz,
  add column if not exists canceled_at timestamptz;

comment on column public.billing_subscriptions.cancel_at is
  'Stripe effective cancellation time. Authorization remains derived from paid entitlements.';
comment on column public.billing_subscriptions.canceled_at is
  'Stripe cancellation request timestamp for audit only; never an access revocation signal.';

grant select (cancel_at, canceled_at)
  on public.billing_subscriptions to authenticated;
create or replace function public.apply_billing_snapshot(p_customer text, p_token uuid, p_event text,
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
      stripe_price_id, status, current_period_end, cancel_at_period_end, cancel_at, canceled_at)
    values (referenced_id, p_customer, row_data->>'plan', row_data->>'price', row_data->>'status',
      nullif(row_data->>'period_end','')::timestamptz,
      coalesce(nullif(row_data->>'cancel_at_period_end','')::boolean, false),
      nullif(row_data->>'cancel_at','')::timestamptz,
      nullif(row_data->>'canceled_at','')::timestamptz)
    on conflict (stripe_subscription_id) do update set plan=excluded.plan, stripe_price_id=excluded.stripe_price_id,
      status=excluded.status, current_period_end=excluded.current_period_end,
      cancel_at_period_end=excluded.cancel_at_period_end, cancel_at=excluded.cancel_at,
      canceled_at=excluded.canceled_at, updated_at=now()
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
revoke all on function public.apply_billing_snapshot(text,uuid,text,text,jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.apply_billing_snapshot(text,uuid,text,text,jsonb,jsonb,jsonb,jsonb)
  to service_role;

commit;
