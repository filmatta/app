-- Dedicated reel artwork uses the existing sanitized-image upload pipeline.
-- No policies are relaxed; public access requires a visible, ready reel reference.
begin;
alter table public.profile_media drop constraint profile_media_purpose_check;
alter table public.profile_media add constraint profile_media_purpose_check
 check (purpose in ('portfolio','portrait','cover','reel_cover'));
alter table public.profile_media add column custom_reel_cover_id uuid references public.profile_media(id) on delete set null;

create function private.is_public_reel_cover(m public.profile_media) returns boolean
language sql stable security definer set search_path='' as $$
 select m.purpose='reel_cover' and exists (
 select 1 from public.profile_media r join public.professional_profiles p on p.user_id=r.owner_id
 where r.owner_id=m.owner_id and r.custom_reel_cover_id=m.id and r.category='reel'
 and r.status='ready' and r.visibility='visible' and p.is_public);
$$;
revoke all on function private.is_public_reel_cover(public.profile_media) from public,anon,authenticated;

create function private.check_reel_cover_reference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.custom_reel_cover_id is not null and new.custom_reel_cover_id is distinct from old.custom_reel_cover_id then
  if new.category<>'reel' or new.media_type<>'video' or not exists (
   select 1 from public.profile_media c where c.id=new.custom_reel_cover_id and c.owner_id=new.owner_id
   and c.purpose='reel_cover' and c.source='storage' and c.status='ready'
   and c.visibility<>'archived' and c.derivative_path is not null
  ) then raise exception 'Invalid reel cover' using errcode='42501'; end if;
 end if;
 if new.thumbnail_id is not null and new.thumbnail_id is distinct from old.thumbnail_id and exists (
  select 1 from public.profile_media c where c.id=new.thumbnail_id and c.purpose='reel_cover'
 ) then raise exception 'Dedicated cover requires reel reference' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.check_reel_cover_reference() from public,anon,authenticated;
create trigger profile_reel_cover_reference before update of custom_reel_cover_id,thumbnail_id on public.profile_media
 for each row execute function private.check_reel_cover_reference();

create function public.set_my_reel_cover(p_reel uuid,p_custom uuid,p_book uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.profile_media;
begin
 perform public.initialize_my_profile_media();
 select * into r from public.profile_media where id=p_reel and owner_id=auth.uid() for update;
 if not found or r.category<>'reel' or r.media_type<>'video' or r.status<>'ready' then
  raise exception 'Not allowed' using errcode='42501'; end if;
 if p_book is not null and not exists(select 1 from public.profile_media c where c.id=p_book and c.owner_id=auth.uid()
  and c.purpose='portfolio' and c.category='book' and c.media_type='image' and c.status='ready' and c.visibility='visible') then
  raise exception 'Invalid book image' using errcode='42501'; end if;
 update public.profile_media set custom_reel_cover_id=p_custom,thumbnail_id=p_book where id=p_reel;
 if r.custom_reel_cover_id is not null and r.custom_reel_cover_id is distinct from p_custom then
  update public.profile_media c set status='deleted',visibility='archived',cleanup_after=now()
  where c.id=r.custom_reel_cover_id and c.purpose='reel_cover'
  and not exists(select 1 from public.profile_media other where other.custom_reel_cover_id=c.id);
 end if;
end $$;
revoke all on function public.set_my_reel_cover(uuid,uuid,uuid) from public,anon;
grant execute on function public.set_my_reel_cover(uuid,uuid,uuid) to authenticated;

-- Failed/cancelled dedicated image attempts can be discarded, never Book or identity images.
create function public.discard_my_reel_cover(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.initialize_my_profile_media();
 update public.profile_media c set status='deleted',visibility='archived',cleanup_after=now()
 where c.id=p_id and c.owner_id=auth.uid() and c.purpose='reel_cover'
 and not exists(select 1 from public.profile_media r where r.custom_reel_cover_id=c.id or r.thumbnail_id=c.id);
 if not found then raise exception 'Not allowed' using errcode='42501'; end if;
end $$;
revoke all on function public.discard_my_reel_cover(uuid) from public,anon;
grant execute on function public.discard_my_reel_cover(uuid) to authenticated;

-- A closed browser can leave a validated upload unassigned. Serialize with
-- selection on the profile row before retiring only expired dedicated covers.
create function public.queue_expired_reel_covers() returns void
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 for owner in select distinct c.owner_id from public.profile_media c
  where c.purpose='reel_cover' and c.status<>'deleted' and c.expires_at<now() loop
  perform 1 from public.professional_profiles where user_id=owner for update;
  update public.profile_media c set status='deleted',visibility='archived',cleanup_after=now()
  where c.owner_id=owner and c.purpose='reel_cover' and c.status<>'deleted' and c.expires_at<now()
  and not exists(select 1 from public.profile_media r where r.custom_reel_cover_id=c.id or r.thumbnail_id=c.id);
 end loop;
end $$;
revoke all on function public.queue_expired_reel_covers() from public,anon,authenticated;
grant execute on function public.queue_expired_reel_covers() to service_role;

create or replace function public.get_profile_media(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p.media_initialized then coalesce((select jsonb_agg(jsonb_build_object(
 'id',m.id,'category',m.category,'title',m.title,'role',m.role,'year',m.year,'description',m.description,
 'media_type',m.media_type,'source',m.source,'url',m.url,'provider',m.provider,'external_video_id',m.external_video_id,
 'thumbnail_id',m.thumbnail_id,'custom_reel_cover_id',m.custom_reel_cover_id,'purpose',m.purpose,
 'featured',m.featured,'sort_order',m.sort_order,'visibility',m.visibility,'status',m.status,
 'image_crop',m.image_crop,'image_width',m.image_width,'image_height',m.image_height,'duration_seconds',m.duration_seconds,'aspect_ratio',m.aspect_ratio,
 'terminal_reason',case when p.user_id=auth.uid() then m.terminal_reason else null end,'created_at',m.created_at,'updated_at',m.updated_at) order by m.sort_order,m.id)
 from public.profile_media m where m.owner_id=p.user_id and (
 (m.purpose='portfolio' and (p.user_id=auth.uid() or (m.visibility='visible' and m.status='ready')))
 or (m.purpose='reel_cover' and m.status='ready' and m.visibility<>'archived'
 and (p.user_id=auth.uid() or private.is_public_reel_cover(m))))) ,'[]'::jsonb) else null end
 from public.professional_profiles p where p.slug=p_slug and (p.is_public or p.user_id=auth.uid());
$$;
create or replace function public.get_profile_media_resource(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storage_path',coalesce(m.derivative_path,m.storage_path),'source',m.source,'url',m.url,'mux_playback_id',m.mux_playback_id,'mux_environment_id',m.mux_environment_id,'mux_environment_type',m.mux_environment_type)
 from public.profile_media m join public.professional_profiles p on p.user_id=m.owner_id
 where m.id=p_id and m.status='ready' and m.visibility<>'archived' and (p.user_id=auth.uid() or (p.is_public and (
 (m.purpose='portfolio' and m.visibility='visible') or (m.purpose in ('portrait','cover') and p.presentation->>(m.purpose||'_media_id')=m.id::text)
 or private.is_public_reel_cover(m))));
$$;
create or replace function public.can_read_profile_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_media m join public.professional_profiles p on p.user_id=m.owner_id
 where (m.storage_path=p_path or m.derivative_path=p_path) and (m.owner_id=auth.uid() or
 (coalesce(m.derivative_path,m.storage_path)=p_path and p.is_public and m.status='ready' and m.visibility<>'archived' and
 ((m.purpose='portfolio' and m.visibility='visible') or (m.purpose in ('portrait','cover') and p.presentation->>(m.purpose||'_media_id')=m.id::text)
 or private.is_public_reel_cover(m)))));
$$;
commit;
