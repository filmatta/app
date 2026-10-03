begin;

-- PostgREST retries SQLSTATE 40001 as a transient database failure. An
-- optimistic-lock miss is an application conflict, so expose the stable
-- domain error instead and let the route translate it to HTTP 409.
create or replace function public.storyboard_save_panel_revision(
  p_actor_id uuid,
  p_panel_id uuid,
  p_expected_revision_id uuid,
  p_operation_id uuid,
  p_document jsonb,
  p_schema_version integer,
  p_base_asset_id uuid,
  p_visual_note text,
  p_logical_width integer,
  p_logical_height integer,
  p_content_kind text,
  p_content_hash text,
  p_source_shot_revision integer,
  p_source_context_hash text
) returns table(panel_id uuid, revision_id uuid, revision_number integer, no_op boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_panel public.storyboard_panels%rowtype;
  current_revision public.storyboard_panel_revisions%rowtype;
  existing_revision public.storyboard_panel_revisions%rowtype;
  result_revision_id uuid;
  next_revision integer;
begin
  if p_actor_id is null or p_operation_id is null or p_expected_revision_id is null then
    raise exception using errcode='22023', message='STORYBOARD_INVALID_SAVE';
  end if;
  select * into target_panel from public.storyboard_panels where id=p_panel_id and owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_PANEL_NOT_FOUND'; end if;
  select * into existing_revision from public.storyboard_panel_revisions r
    where r.owner_id=p_actor_id and r.panel_id=p_panel_id and r.operation_id=p_operation_id;
  if found then
    return query select p_panel_id,existing_revision.id,existing_revision.revision_number,true;
    return;
  end if;
  if target_panel.current_revision_id <> p_expected_revision_id then
    raise exception using errcode='P0001', message='STORYBOARD_REVISION_CONFLICT';
  end if;
  select * into current_revision from public.storyboard_panel_revisions r
    where r.id=target_panel.current_revision_id and r.panel_id=p_panel_id and r.owner_id=p_actor_id for update;
  if not found then raise exception using errcode='P0001', message='STORYBOARD_HEAD_NOT_FOUND'; end if;
  if p_base_asset_id is not null then
    perform 1 from public.writer_production_assets where id=p_base_asset_id and owner_id=p_actor_id and status='ready';
    if not found then raise exception using errcode='P0001', message='STORYBOARD_ASSET_NOT_FOUND'; end if;
  end if;
  if current_revision.content_hash=p_content_hash
    and current_revision.base_asset_id is not distinct from p_base_asset_id
    and current_revision.visual_note is not distinct from nullif(btrim(p_visual_note),'')
    and current_revision.logical_width=p_logical_width
    and current_revision.logical_height=p_logical_height then
    return query select p_panel_id,current_revision.id,current_revision.revision_number,true;
    return;
  end if;
  next_revision := current_revision.revision_number + 1;
  insert into public.storyboard_panel_revisions(
    owner_id,panel_id,revision_number,schema_version,document,base_asset_id,visual_note,
    logical_width,logical_height,content_kind,content_hash,source_shot_revision,source_context_hash,operation_id
  ) values(
    p_actor_id,p_panel_id,next_revision,p_schema_version,p_document,p_base_asset_id,nullif(btrim(p_visual_note),''),
    p_logical_width,p_logical_height,p_content_kind,p_content_hash,p_source_shot_revision,p_source_context_hash,p_operation_id
  ) returning id into result_revision_id;
  update public.storyboard_panels set current_revision_id=result_revision_id,updated_at=clock_timestamp()
    where id=p_panel_id and owner_id=p_actor_id;
  delete from public.storyboard_panel_revisions old
    where old.owner_id=p_actor_id and old.panel_id=p_panel_id and old.id<>result_revision_id
      and not exists(select 1 from public.storyboard_panel_approvals a where a.revision_id=old.id and a.owner_id=p_actor_id)
      and not exists(select 1 from public.storyboard_panel_renders r where r.revision_id=old.id and r.owner_id=p_actor_id)
      and old.id in (
        select retained.id from public.storyboard_panel_revisions retained
        where retained.owner_id=p_actor_id and retained.panel_id=p_panel_id and retained.id<>result_revision_id
        order by retained.revision_number desc offset 10
      );
  return query select p_panel_id,result_revision_id,next_revision,false;
end
$$;

revoke all on function public.storyboard_save_panel_revision(uuid,uuid,uuid,uuid,jsonb,integer,uuid,text,integer,integer,text,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.storyboard_save_panel_revision(uuid,uuid,uuid,uuid,jsonb,integer,uuid,text,integer,integer,text,text,integer,text)
  to service_role;

commit;
