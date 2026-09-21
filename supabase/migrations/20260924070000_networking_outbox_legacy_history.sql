begin;
-- No client policy: email delivery belongs to a trusted backend worker only.
alter table private.network_email_outbox enable row level security;
create function public.list_my_legacy_profile_contacts(
  p_box text default 'received',
  p_page integer default 1
) returns table(
  id uuid, message text, response_message text, status text,
  created_at timestamptz, read_at timestamptz, responded_at timestamptz,
  is_recipient boolean, source_type text, contact_type text,
  counterpart_name text, counterpart_profile_slug text,
  target_name text, target_profile_slug text
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.message, i.response_message, i.status,
    i.created_at, i.read_at, i.responded_at,
    i.recipient_id = auth.uid(), i.source_type, i.contact_type,
    case when i.recipient_id = auth.uid()
      then i.sender_display_name else target.display_name end,
    case when i.recipient_id = auth.uid() and sender.is_public then sender.slug
      when i.sender_id = auth.uid() and target.is_public then target.slug end,
    target.display_name,
    case when target.is_public then target.slug end
  from public.catalog_inquiries i
  join public.professional_profiles target on target.user_id = i.profile_id
  left join public.professional_profiles sender on sender.user_id = i.sender_id
  where i.profile_id is not null and i.request_state is null
    and ((p_box = 'received' and i.recipient_id = auth.uid() and i.recipient_archived_at is null)
      or (p_box = 'sent' and i.sender_id = auth.uid() and i.sender_archived_at is null))
  order by i.created_at desc, i.id
  limit 25 offset ((greatest(1, least(coalesce(p_page,1),1000))-1)*24);
$$;
revoke all on function public.list_my_legacy_profile_contacts(text,integer) from public,anon;
grant execute on function public.list_my_legacy_profile_contacts(text,integer) to authenticated;
commit;
