-- SimpleCVTool v4 — à exécuter UNE FOIS dans Supabase > SQL Editor.
-- Toutes les données métier sont dans Supabase PostgreSQL ; les politiques RLS
-- empêchent chaque utilisateur de voir ou modifier celles d'autrui.

create schema if not exists simplecv_internal;
revoke all on schema simplecv_internal from public, anon, authenticated;

create table if not exists public.user_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content jsonb not null default '{"cvs":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_documents_object check (jsonb_typeof(content)='object'),
  constraint user_documents_size check (octet_length(content::text) <= 2000000)
);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','pass')),
  access_until timestamptz,
  free_ai_used integer not null default 0 check (free_ai_used >= 0),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id,day)
);

create table if not exists public.stripe_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.user_documents enable row level security;
alter table public.entitlements enable row level security;
alter table public.ai_daily_usage enable row level security;
alter table public.stripe_events enable row level security;

-- Cette table est lue et écrite uniquement par son propriétaire.
drop policy if exists user_documents_select on public.user_documents;
create policy user_documents_select on public.user_documents for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists user_documents_insert on public.user_documents;
create policy user_documents_insert on public.user_documents for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists user_documents_update on public.user_documents;
create policy user_documents_update on public.user_documents for update to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists user_documents_delete on public.user_documents;
create policy user_documents_delete on public.user_documents for delete to authenticated using ((select auth.uid())=user_id);

-- Les droits de paiement ne peuvent PAS être modifiés par le navigateur.
drop policy if exists entitlements_select on public.entitlements;
create policy entitlements_select on public.entitlements for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists ai_daily_usage_select on public.ai_daily_usage;
create policy ai_daily_usage_select on public.ai_daily_usage for select to authenticated using ((select auth.uid())=user_id);

-- Le trigger crée la ligne de droits lors de l'inscription.
create or replace function simplecv_internal.on_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entitlements(user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
revoke all on function simplecv_internal.on_user_created() from public, anon, authenticated;
drop trigger if exists simplecv_auth_signup on auth.users;
create trigger simplecv_auth_signup after insert on auth.users
for each row execute function simplecv_internal.on_user_created();

-- Les utilisateurs créés avant l'installation ont aussi leurs droits.
insert into public.entitlements(user_id)
select id from auth.users on conflict do nothing;

-- Réservation transactionnelle, concurrente, du quota IA.
-- Contrôle uniquement depuis la clé serveur service_role.
create or replace function public.reserve_ai_use(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_ent public.entitlements%rowtype;
  v_used int;
  v_is_premium boolean;
  v_day date := (now() at time zone 'UTC')::date;
begin
  insert into public.entitlements(user_id) values(p_user_id) on conflict do nothing;
  select * into v_ent from public.entitlements where user_id=p_user_id for update;
  v_is_premium := v_ent.plan in ('pro','pass') and v_ent.access_until > now();
  if not v_is_premium then
    if v_ent.free_ai_used >= 1 then
      return jsonb_build_object('allowed',false,'message','Essai IA gratuit déjà utilisé.','remaining',0);
    end if;
    update public.entitlements set free_ai_used=free_ai_used+1, updated_at=now() where user_id=p_user_id;
    return jsonb_build_object('allowed',true,'plan','free','remaining',0);
  end if;
  insert into public.ai_daily_usage(user_id,day,used) values(p_user_id,v_day,0) on conflict do nothing;
  select used into v_used from public.ai_daily_usage where user_id=p_user_id and day=v_day for update;
  if v_used >= 20 then
    return jsonb_build_object('allowed',false,'message','Limite de 20 utilisations IA par jour atteinte.','remaining',0);
  end if;
  update public.ai_daily_usage set used=used+1 where user_id=p_user_id and day=v_day;
  return jsonb_build_object('allowed',true,'plan',v_ent.plan,'remaining',19-v_used);
end; $$;

create or replace function public.refund_ai_use(p_user_id uuid,p_plan text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_plan='free' then
    update public.entitlements set free_ai_used=greatest(0,free_ai_used-1) where user_id=p_user_id;
  else
    update public.ai_daily_usage set used=greatest(0,used-1)
      where user_id=p_user_id and day=(now() at time zone 'UTC')::date;
  end if;
end; $$;

revoke all on function public.reserve_ai_use(uuid) from public,anon,authenticated;
revoke all on function public.refund_ai_use(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_use(uuid) to service_role;
grant execute on function public.refund_ai_use(uuid,text) to service_role;

-- Permissions des tables : pas de modification des droits ou quotas côté client.
revoke all on public.entitlements, public.ai_daily_usage, public.stripe_events from anon,authenticated;
grant select on public.entitlements,public.ai_daily_usage to authenticated;
grant select,insert,update,delete on public.user_documents to authenticated;
-- service_role contourne RLS et peut gérer facturation et compteurs.

-- Vérification :
-- select tablename, rowsecurity from pg_tables where schemaname='public';

-- Les fonctions RPC sont exécutées par service_role exclusivement.
grant select,insert,update,delete on public.user_documents,public.entitlements,public.ai_daily_usage,public.stripe_events to service_role;
