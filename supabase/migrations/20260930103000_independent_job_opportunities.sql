-- Projects V1.5 preserves the Job inquiry flow for independent Opportunities.
begin;

create or replace function public.send_job_inquiry(p_slug text,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); listing public.opportunities; target uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.professional_profiles where user_id=actor and is_public) then raise exception 'Public professional profile required' using errcode='42501'; end if;
 select o.* into listing from public.opportunities o
 where o.slug=p_slug and o.status='published' and o.opportunity_type='job'
 and o.application_deadline>now() for share of o;
 if not found or listing.owner_id=actor then raise exception 'Job unavailable for inquiry' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if (select count(*) from public.catalog_inquiries where sender_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily inquiry limit reached' using errcode='22023'; end if;
 insert into public.catalog_inquiries(opportunity_id,sender_id,recipient_id,message) values(listing.id,actor,listing.owner_id,btrim(p_message)) returning id into target;
 return target;
end; $$;
revoke all on function public.send_job_inquiry(text,text) from public,anon,authenticated;
grant execute on function public.send_job_inquiry(text,text) to authenticated;

commit;
