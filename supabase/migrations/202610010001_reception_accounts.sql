-- Cuentas de recepción creadas por el admin de la clínica (sin invitación).
--
-- a) profiles.account_type admite 'RECEPCION'.
-- b) handle_new_user(): base 202608190001 (= live en QA y prod al 2026-10-01).
--    Una cuenta RECEPCION creada por fuera del panel (registro público con
--    metadata manipulada) no tiene membresías: por d) queda en solo lectura.
--    Para RECEPCION: full_name desde metadata (fallback 'Recepción'), sin
--    matrícula ni datos de organización, sin prueba (trial_* null) y
--    role 'reception' (profiles.role no tiene check).
-- c) ensure_kinesiologist_personal_workspace no se toca: ya hace early return
--    si el profile no es KINESIOLOGO (en QA el trigger
--    ensure_profile_personal_workspace también filtra KINESIOLOGO).
-- d) get_account_access_level(): base = versión live (igual en QA y prod).
--    Una cuenta RECEPCION toma el acceso de sus clínicas (membresías
--    RECEPCION accepted); sin ellas, READ_ONLY. Antes, con trial_ends_at
--    null devolvía TRIAL_ACTIVE para siempre y los pacientes creados por
--    recepción (owner_id = recepción) salteaban el solo lectura de la clínica.
-- e) admin_weekly_kpis(): base 202609280002. "Activación" cuenta solo
--    KINESIOLOGO / CONSULTORIO, igual que "Registraciones".

begin;

-- a)
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('KINESIOLOGO', 'CONSULTORIO', 'RECEPCION'));

-- b)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_account_type text;
  organization_name text;
begin
  new_account_type := coalesce(
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'accountType',
    'KINESIOLOGO'
  );

  if new_account_type not in ('KINESIOLOGO', 'CONSULTORIO', 'RECEPCION') then
    new_account_type := 'KINESIOLOGO';
  end if;

  organization_name := coalesce(
    nullif(new.raw_user_meta_data->>'organization_name', ''),
    nullif(new.raw_user_meta_data->>'clinic_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'Consultorio'
  );

  insert into public.profiles (
    id,
    account_type,
    email,
    full_name,
    license_number,
    phone,
    specialty,
    organization_name,
    organization_address,
    responsible_name,
    role,
    trial_started_at,
    trial_ends_at
  )
  values (
    new.id,
    new_account_type,
    lower(new.email),
    case
      when new_account_type = 'CONSULTORIO' then organization_name
      when new_account_type = 'RECEPCION' then
        coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'Recepción')
      else coalesce(new.raw_user_meta_data->>'full_name', 'Kinesiologo')
    end,
    case
      when new_account_type = 'KINESIOLOGO' then new.raw_user_meta_data->>'license_number'
      else null
    end,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',
    case when new_account_type = 'CONSULTORIO' then organization_name else null end,
    case
      when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'organization_address'
      else null
    end,
    case
      when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'responsible_name'
      else null
    end,
    case
      when new_account_type = 'CONSULTORIO' then 'clinic'
      when new_account_type = 'RECEPCION' then 'reception'
      else 'kinesiologist'
    end,
    case when new_account_type = 'RECEPCION' then null else now() end,
    case when new_account_type = 'RECEPCION' then null else now() + interval '3 months' end
  )
  on conflict (id) do update
  set
    account_type = excluded.account_type,
    email = excluded.email,
    full_name = excluded.full_name,
    license_number = excluded.license_number,
    phone = excluded.phone,
    specialty = excluded.specialty,
    organization_name = excluded.organization_name,
    organization_address = excluded.organization_address,
    responsible_name = excluded.responsible_name,
    role = excluded.role,
    trial_started_at = coalesce(public.profiles.trial_started_at, excluded.trial_started_at),
    trial_ends_at = coalesce(public.profiles.trial_ends_at, excluded.trial_ends_at),
    updated_at = now();

  if new_account_type = 'CONSULTORIO' then
    insert into public.clinics (
      owner_id,
      name,
      email,
      phone,
      address,
      responsible_name
    )
    values (
      new.id,
      organization_name,
      lower(new.email),
      new.raw_user_meta_data->>'phone',
      new.raw_user_meta_data->>'organization_address',
      new.raw_user_meta_data->>'responsible_name'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

-- d)
CREATE OR REPLACE FUNCTION public.get_account_access_level(target_account_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  has_active_paid boolean;
  trial_end timestamptz;
  target_account_type text;
  clinic_levels text[];
begin
  -- Una cuenta de recepción no tiene prueba ni plan propios: su acceso es el
  -- de las clínicas donde tiene membresía activa (el más permisivo si hay
  -- más de una). Sin membresías activas, solo lectura.
  select profiles.account_type
    into target_account_type
  from public.profiles
  where profiles.id = target_account_id;

  if target_account_type = 'RECEPCION' then
    select array_agg(public.get_account_access_level(workspaces.owner_id))
      into clinic_levels
    from public.workspace_members
    join public.workspaces on workspaces.id = workspace_members.workspace_id
    where workspace_members.user_id = target_account_id
      and workspace_members.role = 'RECEPCION'
      and workspace_members.status = 'accepted'
      and workspaces.type = 'CLINICA'
      and workspaces.owner_id is not null
      and workspaces.owner_id <> target_account_id;

    if 'PAID_ACTIVE' = any(coalesce(clinic_levels, '{}')) then
      return 'PAID_ACTIVE';
    end if;

    if 'TRIAL_ACTIVE' = any(coalesce(clinic_levels, '{}')) then
      return 'TRIAL_ACTIVE';
    end if;

    return 'READ_ONLY';
  end if;

  select exists (
    select 1
    from public.subscriptions
    where subscriptions.account_id = target_account_id
      and subscriptions.status = 'ACTIVE'
  ) into has_active_paid;

  if has_active_paid then
    return 'PAID_ACTIVE';
  end if;

  select profiles.trial_ends_at
    into trial_end
  from public.profiles
  where profiles.id = target_account_id;

  if trial_end is null or trial_end > now() then
    return 'TRIAL_ACTIVE';
  end if;

  return 'READ_ONLY';
end;
$function$;

-- e)
create or replace function public.admin_weekly_kpis(
  p_weeks integer default 8,
  p_end_date date default (timezone('America/Argentina/Buenos_Aires', now()))::date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with bounds as (
    select
      (date_trunc('week', p_end_date::timestamp)::date - (gs.n * 7)) as week_start
    from generate_series(0, greatest(least(p_weeks, 52), 1) - 1) as gs(n)
  ),
  weeks as (
    select
      week_start,
      (week_start::timestamp at time zone 'America/Argentina/Buenos_Aires') as starts_at,
      ((week_start + 7)::timestamp at time zone 'America/Argentina/Buenos_Aires') as ends_at
    from bounds
  ),
  -- Actividad por cuenta: dueño del workspace donde se creó el registro.
  activity as (
    select w.owner_id, a.created_at from public.appointments a join public.workspaces w on w.id = a.workspace_id
    union all
    select w.owner_id, p.created_at from public.patients p join public.workspaces w on w.id = p.workspace_id
    union all
    select w.owner_id, e.created_at from public.evolutions e join public.workspaces w on w.id = e.workspace_id
  ),
  weekly as (
    select
      wk.week_start,
      (select count(*) from public.profiles pr
        where pr.created_at >= wk.starts_at and pr.created_at < wk.ends_at
          and pr.account_type = 'KINESIOLOGO') as registrations_kine,
      (select count(*) from public.profiles pr
        where pr.created_at >= wk.starts_at and pr.created_at < wk.ends_at
          and pr.account_type = 'CONSULTORIO') as registrations_clinic,
      (select count(*) from public.profiles pr
        where pr.created_at >= wk.starts_at and pr.created_at < wk.ends_at
          and pr.account_type in ('KINESIOLOGO', 'CONSULTORIO')
          and exists (
            select 1 from activity ac
            where ac.owner_id = pr.id
              and ac.created_at >= pr.created_at
              and ac.created_at < pr.created_at + interval '7 days'
          )) as activated,
      (select count(*) from public.appointments a
        where a.created_at >= wk.starts_at and a.created_at < wk.ends_at) as appointments_total,
      (select count(*) from public.appointments a
        where a.created_at >= wk.starts_at and a.created_at < wk.ends_at
          and a.booking_source = 'manual') as appointments_manual,
      (select count(*) from public.appointments a
        where a.created_at >= wk.starts_at and a.created_at < wk.ends_at
          and a.booking_source = 'public_link') as appointments_online_link,
      (select count(*) from public.appointments a
        where a.created_at >= wk.starts_at and a.created_at < wk.ends_at
          and a.booking_source = 'public_qr') as appointments_online_qr,
      (select count(*) from public.appointments a
        where a.scheduled_at >= wk.starts_at and a.scheduled_at < wk.ends_at
          and a.status = 'attended') as appointments_attended,
      (select count(*) from public.appointments a
        where a.scheduled_at >= wk.starts_at and a.scheduled_at < wk.ends_at
          and a.status = 'no_show') as appointments_no_show,
      (select count(*) from public.patients p
        where p.created_at >= wk.starts_at and p.created_at < wk.ends_at) as patients_new,
      (select count(*) from public.evolutions e
        where e.created_at >= wk.starts_at and e.created_at < wk.ends_at) as evolutions_new,
      (select count(distinct ac.owner_id) from activity ac
        where ac.created_at >= wk.starts_at and ac.created_at < wk.ends_at) as active_accounts,
      (select count(*) from public.profiles pr
        where pr.trial_started_at >= wk.starts_at and pr.trial_started_at < wk.ends_at) as trials_started,
      (select count(*) from public.subscriptions s
        where s.activated_at >= wk.starts_at and s.activated_at < wk.ends_at) as subscriptions_new,
      (select count(*) from public.subscriptions s
        where s.canceled_at >= wk.starts_at and s.canceled_at < wk.ends_at) as subscriptions_canceled
    from weeks wk
  ),
  current_week as (
    select starts_at, ends_at from weeks order by week_start desc limit 1
  ),
  previous_week as (
    select starts_at - interval '7 days' as starts_at, starts_at as ends_at from current_week
  ),
  top_accounts as (
    select pr.id, pr.email, pr.account_type,
      coalesce(nullif(trim(pr.organization_name), ''), nullif(trim(pr.full_name), ''), pr.email) as name,
      count(*) as appointments
    from public.appointments a
    join public.workspaces w on w.id = a.workspace_id
    join public.profiles pr on pr.id = w.owner_id
    cross join current_week cw
    where a.created_at >= cw.starts_at and a.created_at < cw.ends_at
    group by pr.id
    order by appointments desc, name
    limit 10
  ),
  at_risk as (
    select pr.id, pr.email, pr.account_type,
      coalesce(nullif(trim(pr.organization_name), ''), nullif(trim(pr.full_name), ''), pr.email) as name,
      (select max(ac.created_at) from activity ac where ac.owner_id = pr.id) as last_activity_at
    from public.profiles pr
    where exists (
        select 1 from activity ac, previous_week pw
        where ac.owner_id = pr.id and ac.created_at >= pw.starts_at and ac.created_at < pw.ends_at
      )
      and not exists (
        select 1 from activity ac, current_week cw
        where ac.owner_id = pr.id and ac.created_at >= cw.starts_at and ac.created_at < cw.ends_at
      )
    order by last_activity_at desc
    limit 20
  )
  select jsonb_build_object(
    'generated_at', now(),
    'weeks', coalesce((select jsonb_agg(to_jsonb(weekly) order by week_start) from weekly), '[]'::jsonb),
    'totals', jsonb_build_object(
      'accounts', (select count(*) from public.profiles where account_type in ('KINESIOLOGO', 'CONSULTORIO')),
      'active_subscriptions', (select count(*) from public.subscriptions where status = 'ACTIVE'),
      'mrr', (select coalesce(sum(pl.price), 0) from public.subscriptions s
              join public.plans pl on pl.id = s.plan_id
              where s.status = 'ACTIVE' and pl.billing_period = 'month'),
      'workspaces_with_online_booking', (select count(distinct workspace_id) from public.appointments
              where booking_source <> 'manual')
    ),
    'top_accounts', coalesce((select jsonb_agg(to_jsonb(top_accounts)) from top_accounts), '[]'::jsonb),
    'at_risk', coalesce((select jsonb_agg(to_jsonb(at_risk)) from at_risk), '[]'::jsonb)
  );
$function$;

revoke all on function public.admin_weekly_kpis(integer, date) from public, anon, authenticated;
grant execute on function public.admin_weekly_kpis(integer, date) to service_role;

commit;
