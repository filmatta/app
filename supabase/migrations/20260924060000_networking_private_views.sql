begin;
-- Fixed public projection: no caller-selected offset or arbitrary graph query.
drop function public.get_profile_followers(text);
create function public.get_profile_followers(p_slug text)
returns table(slug text,display_name text,portrait_media_id text,portrait_url text,total_count bigint)
language sql stable security definer set search_path='' as $$
 select p.slug,p.display_name,p.presentation->>'portrait_media_id',p.presentation->>'portrait_url',count(*) over()
 from public.profile_follows f
 join public.professional_profiles target on target.user_id=f.profile_id and target.is_public
 join public.professional_profiles p on p.user_id=f.follower_id and p.is_public
 where target.slug=p_slug order by f.created_at desc,f.follower_id limit 7;
$$;
revoke all on function public.get_profile_followers(text) from public;
grant execute on function public.get_profile_followers(text) to anon,authenticated;

create function public.get_my_network_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.refresh_my_contact_requests();
 return jsonb_build_object(
  'followers',(select count(*) from public.profile_follows where profile_id=auth.uid()),
  'following',(select count(*) from public.profile_follows where follower_id=auth.uid()),
  'pending_received',(select count(*) from public.catalog_inquiries where recipient_id=auth.uid() and request_state='pending'),
  'unread',(select count(*) from public.notifications where user_id=auth.uid() and read_at is null));
end $$;
revoke all on function public.get_my_network_summary() from public,anon;
grant execute on function public.get_my_network_summary() to authenticated;

create function public.get_my_network(p_box text default 'followers',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_box is null or p_box not in ('followers','following') then raise exception 'Invalid list' using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select case when p_box='followers' then f.follower_id else f.profile_id end as profile_id,
   p.slug,coalesce(p.display_name,'Miembro de FILMATTA') as display_name,p.disciplines[1] as discipline,p.city,
   p.presentation->>'portrait_media_id' as portrait_media_id,p.presentation->>'portrait_url' as portrait_url
  from public.profile_follows f left join public.professional_profiles p
   on p.user_id=case when p_box='followers' then f.follower_id else f.profile_id end and p.is_public
  where (p_box='followers' and f.profile_id=auth.uid()) or (p_box='following' and f.follower_id=auth.uid())
  order by f.created_at desc,f.follower_id,f.profile_id limit 25 offset (greatest(1,least(coalesce(p_page,1),1000))-1)*24
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.get_my_network(text,integer) from public,anon;
grant execute on function public.get_my_network(text,integer) to authenticated;
create function public.unfollow_my_network_profile(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 delete from public.profile_follows where follower_id=auth.uid() and profile_id=p_id;
end $$;
revoke all on function public.unfollow_my_network_profile(uuid) from public,anon;
grant execute on function public.unfollow_my_network_profile(uuid) to authenticated;

create function public.get_my_network_notifications(p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.refresh_my_contact_requests();
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select n.id,n.type,n.created_at,n.read_at,coalesce(p.display_name,'Un miembro de FILMATTA') actor_name,
   case when n.entity_type='contact_request' then '/cuenta/contactos/'||n.entity_id::text
    when p.slug is not null then '/perfiles/'||p.slug else '/mi-red' end href
  from public.notifications n left join public.professional_profiles p on p.user_id=n.actor_user_id and p.is_public
  where n.user_id=auth.uid() order by n.created_at desc,n.id limit 25 offset (greatest(1,least(coalesce(p_page,1),1000))-1)*24
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.get_my_network_notifications(integer) from public,anon;
grant execute on function public.get_my_network_notifications(integer) to authenticated;
create function public.mark_my_network_notification(p_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_id is null or id=p_id);
end $$;
revoke all on function public.mark_my_network_notification(uuid) from public,anon;
grant execute on function public.mark_my_network_notification(uuid) to authenticated;

-- Internal serializer only; public entrypoints enforce participant identity.
create function private.network_request_projection(i public.catalog_inquiries) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'is_recipient',i.recipient_id=auth.uid(),'message',i.message,
  'state',i.request_state,'created_at',i.created_at,'expires_at',i.expires_at,'accepted_at',i.accepted_at,
  'contact_unlocked_at',i.contact_unlocked_at,'shared_contact_snapshot',i.shared_contact_snapshot,
  'project_snapshot',i.project_snapshot,'credit_required',coalesce(r.credit_required,false),
  'counterpart_name',coalesce(p.display_name,case when i.recipient_id=auth.uid() then i.sender_display_name end,'Miembro de FILMATTA'),
  'counterpart_slug',p.slug,'discipline',p.disciplines[1],'city',p.city,
  'portrait_media_id',p.presentation->>'portrait_media_id','portrait_url',p.presentation->>'portrait_url')
 from (values(1)) v(x)
 left join public.professional_profiles p on p.user_id=case when i.recipient_id=auth.uid() then i.sender_id else i.recipient_id end and p.is_public
 left join public.contact_credit_reservations r on r.request_id=i.id;
$$;
revoke all on function private.network_request_projection(public.catalog_inquiries) from public,anon,authenticated;
create function public.list_my_contact_requests(p_box text default 'received',p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_box is null or p_box not in ('received','sent','expired','accepted') then raise exception 'Invalid list' using errcode='22023';end if;
 perform public.refresh_my_contact_requests();
 return coalesce((select jsonb_agg(private.network_request_projection(x)) from (
  select i.* from public.catalog_inquiries i where auth.uid() in(i.sender_id,i.recipient_id) and i.request_state is not null and (
   (p_box='received' and i.recipient_id=auth.uid() and i.request_state in ('pending','rejected','cancelled')) or
   (p_box='sent' and i.sender_id=auth.uid() and i.request_state in ('pending','rejected','cancelled')) or
   (p_box='expired' and i.request_state='expired') or (p_box='accepted' and i.request_state='accepted'))
  order by i.created_at desc,i.id limit 25 offset (greatest(1,least(coalesce(p_page,1),1000))-1)*24
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.list_my_contact_requests(text,integer) from public,anon;
grant execute on function public.list_my_contact_requests(text,integer) to authenticated;
create function public.get_my_contact_request(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.refresh_my_contact_requests();
 return (select private.network_request_projection(i) from public.catalog_inquiries i
  where i.id=p_id and i.request_state is not null and auth.uid() in(i.sender_id,i.recipient_id));
end $$;
revoke all on function public.get_my_contact_request(uuid) from public,anon;
grant execute on function public.get_my_contact_request(uuid) to authenticated;
commit;
