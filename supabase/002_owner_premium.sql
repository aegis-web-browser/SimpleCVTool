-- Exécuté sur le projet Supabase SimpleCVTool pour une activation Premium privée.
-- Le code d'activation ne doit jamais être enregistré dans cette migration.
alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements add constraint entitlements_plan_check check (plan in ('free','pro','pass','promo'));
alter table public.entitlements add column if not exists promo_redeemed_at timestamptz;
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
 v_is_premium := v_ent.plan='promo' or (v_ent.plan in ('pro','pass') and v_ent.access_until > now());
 if not v_is_premium then
  if v_ent.free_ai_used >= 1 then
   return jsonb_build_object('allowed',false,'message','Essai IA gratuit déjà utilisé.','remaining',0);
  end if;
  update public.entitlements set free_ai_used=free_ai_used+1,updated_at=now() where user_id=p_user_id;
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
revoke all on function public.reserve_ai_use(uuid) from public,anon,authenticated;
grant execute on function public.reserve_ai_use(uuid) to service_role;
