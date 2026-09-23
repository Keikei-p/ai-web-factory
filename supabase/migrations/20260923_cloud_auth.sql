-- AI Web Factory cloud foundation
-- Run in a new Supabase project before enabling VITE_APP_MODE=cloud.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_code text not null unique,
  project_name text not null,
  client_name text not null default '',
  contact_name text not null default '',
  contact text not null default '',
  source text not null default 'manual',
  request_details text not null,
  site_type text not null default '',
  purpose text not null default '',
  target text not null default '',
  required_pages text not null default '',
  design_preferences text not null default '',
  reference_sites text not null default '',
  required_features text not null default '',
  assets text not null default '',
  desired_deadline text not null default '',
  budget text not null default '',
  status text not null default '新規',
  priority text not null default '通常',
  assignee text not null default '',
  preview_url text not null default '',
  github_repository text not null default '',
  final_confirmation integer not null default 0,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  summary text not null default '',
  missing_information text not null default '',
  customer_questions text not null default '',
  recommended_structure text not null default '',
  recommended_features text not null default '',
  recommended_design text not null default '',
  production_notes text not null default '',
  raw_json text not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.project_specs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null default 1,
  content_json text not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  approval_type text not null,
  decision text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.project_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.site_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  spec_id uuid not null references public.project_specs(id) on delete restrict,
  version integer not null,
  output_dir text not null default '',
  manifest_json text not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  build_id uuid not null references public.site_builds(id) on delete cascade,
  result_json text not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_build_id uuid not null references public.site_builds(id) on delete restrict,
  to_build_id uuid not null references public.site_builds(id) on delete cascade,
  instruction_type text not null,
  value_json text not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_owner_updated on public.projects(owner_id, updated_at desc);
create index if not exists idx_analyses_owner_project on public.project_analyses(owner_id, project_id, created_at desc);
create index if not exists idx_specs_owner_project on public.project_specs(owner_id, project_id, version desc);
create index if not exists idx_approvals_owner_project on public.project_approvals(owner_id, project_id, created_at desc);
create index if not exists idx_history_owner_project on public.project_history(owner_id, project_id, created_at desc);
create index if not exists idx_builds_owner_project on public.site_builds(owner_id, project_id, version desc);
create index if not exists idx_quality_owner_build on public.quality_checks(owner_id, build_id, created_at desc);
create index if not exists idx_revisions_owner_project on public.revision_requests(owner_id, project_id, created_at desc);

alter table public.projects enable row level security;
alter table public.project_analyses enable row level security;
alter table public.project_specs enable row level security;
alter table public.project_approvals enable row level security;
alter table public.project_history enable row level security;
alter table public.site_builds enable row level security;
alter table public.quality_checks enable row level security;
alter table public.revision_requests enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_analyses from anon, authenticated;
revoke all on table public.project_specs from anon, authenticated;
revoke all on table public.project_approvals from anon, authenticated;
revoke all on table public.project_history from anon, authenticated;
revoke all on table public.site_builds from anon, authenticated;
revoke all on table public.quality_checks from anon, authenticated;
revoke all on table public.revision_requests from anon, authenticated;

grant select, insert on table public.projects to authenticated;
grant update (
  project_name, client_name, contact_name, contact, source, request_details,
  site_type, purpose, target, required_pages, design_preferences, reference_sites,
  required_features, assets, desired_deadline, budget, priority, assignee,
  github_repository
) on table public.projects to authenticated;

grant select on table public.project_analyses to authenticated;
grant select on table public.project_specs to authenticated;
grant select on table public.project_approvals to authenticated;
grant select, insert on table public.project_history to authenticated;
grant select on table public.site_builds to authenticated;
grant select on table public.quality_checks to authenticated;
grant select on table public.revision_requests to authenticated;

create policy "projects_select_own"
on public.projects for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "projects_insert_own"
on public.projects for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "projects_update_own"
on public.projects for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "analyses_select_own"
on public.project_analyses for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "specs_select_own"
on public.project_specs for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "approvals_select_own"
on public.project_approvals for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "history_select_own"
on public.project_history for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "history_insert_own"
on public.project_history for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

create policy "builds_select_own"
on public.site_builds for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "quality_select_own"
on public.quality_checks for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "revisions_select_own"
on public.revision_requests for select to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.awf_prepare_project_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  new.owner_id := (select auth.uid());
  new.status := '新規';
  new.final_confirmation := 0;
  new.delivered_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists awf_prepare_project_insert_trigger on public.projects;
create trigger awf_prepare_project_insert_trigger
before insert on public.projects
for each row execute function public.awf_prepare_project_insert();

create or replace function public.awf_touch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists awf_touch_project_trigger on public.projects;
create trigger awf_touch_project_trigger
before update on public.projects
for each row execute function public.awf_touch_project();

create or replace function public.record_project_approval(
  p_project_id uuid,
  p_approval_type text,
  p_decision text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_label text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid decision'; end if;
  if p_approval_type not in (
    'production_start', 'customer_contact', 'paid_service', 'billing',
    'domain_purchase', 'dns_change', 'production_publish', 'final_delivery'
  ) then raise exception 'invalid approval type'; end if;

  select status into v_status
  from public.projects
  where id = p_project_id and owner_id = v_uid
  for update;

  if not found then raise exception 'project not found'; end if;

  if p_approval_type = 'production_start' and v_status <> '制作待ち' then
    raise exception 'production start approval requires 制作待ち';
  end if;
  if p_approval_type = 'final_delivery' and v_status <> '最終確認' then
    raise exception 'final delivery approval requires 最終確認';
  end if;

  v_label := case p_approval_type
    when 'production_start' then '制作開始'
    when 'customer_contact' then '顧客への連絡'
    when 'paid_service' then '有料サービス契約'
    when 'billing' then '課金'
    when 'domain_purchase' then 'ドメイン購入'
    when 'dns_change' then 'DNS変更'
    when 'production_publish' then '本番公開'
    when 'final_delivery' then '最終納品'
  end;

  insert into public.project_approvals (
    owner_id, project_id, approval_type, decision, note
  ) values (
    v_uid, p_project_id, p_approval_type, p_decision, left(coalesce(p_note, ''), 2000)
  );

  if p_approval_type = 'final_delivery' then
    update public.projects
    set final_confirmation = case when p_decision = 'approved' then 1 else 0 end
    where id = p_project_id and owner_id = v_uid;
  end if;

  insert into public.project_history(owner_id, project_id, event_type, description)
  values (
    v_uid,
    p_project_id,
    'approval_recorded',
    v_label || case when p_decision = 'approved' then 'を承認しました。' else 'を差し戻しました。' end
  );
end;
$$;

create or replace function public.change_project_status(
  p_project_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current text;
  v_allowed text[];
  v_required_approval text;
  v_latest_decision text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select status into v_current
  from public.projects
  where id = p_project_id and owner_id = v_uid
  for update;

  if not found then raise exception 'project not found'; end if;

  v_allowed := case v_current
    when '新規' then array['AI分析中']
    when 'AI分析中' then array['情報不足', '確認待ち']
    when '情報不足' then array['AI分析中', '確認待ち']
    when '確認待ち' then array['制作待ち']
    when '制作待ち' then array['制作中']
    when '制作中' then array['AI品質チェック']
    when 'AI品質チェック' then array['ユーザー確認', '修正中']
    when 'ユーザー確認' then array['修正中', '最終確認']
    when '修正中' then array['再チェック']
    when '再チェック' then array['ユーザー確認', '修正中', '最終確認']
    when '最終確認' then array['納品']
    when '納品' then array['完了']
    else array[]::text[]
  end;

  if not (p_status = any(v_allowed)) then
    raise exception 'invalid status transition';
  end if;

  v_required_approval := case
    when v_current = '制作待ち' and p_status = '制作中' then 'production_start'
    when v_current = '最終確認' and p_status = '納品' then 'final_delivery'
    else null
  end;

  if v_required_approval is not null then
    select decision into v_latest_decision
    from public.project_approvals
    where project_id = p_project_id
      and owner_id = v_uid
      and approval_type = v_required_approval
    order by created_at desc
    limit 1;

    if coalesce(v_latest_decision, '') <> 'approved' then
      raise exception 'required approval missing';
    end if;
  end if;

  update public.projects
  set
    status = p_status,
    delivered_at = case when p_status = '納品' then now() else delivered_at end
  where id = p_project_id and owner_id = v_uid;

  insert into public.project_history(owner_id, project_id, event_type, description)
  values (
    v_uid,
    p_project_id,
    'status_changed',
    'ステータスを「' || v_current || '」から「' || p_status || '」へ変更しました。'
  );
end;
$$;

revoke all on function public.record_project_approval(uuid, text, text, text) from public;
revoke all on function public.change_project_status(uuid, text) from public;
grant execute on function public.record_project_approval(uuid, text, text, text) to authenticated;
grant execute on function public.change_project_status(uuid, text) to authenticated;
