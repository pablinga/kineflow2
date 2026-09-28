-- Panel admin de la plataforma (/admin).
--
-- 1. appointments.booking_source: de dónde salió el turno (manual, enlace
--    público o QR). Antes solo se distinguía por la nota automática de la
--    reserva online; se completa a partir de esa nota.
-- 2. admin_login_attempts: intentos de login al panel, para bloquear por IP.
-- 3. admin_weekly_kpis(): métricas semanales (semanas lunes a domingo, hora
--    de Argentina). Solo la puede ejecutar service_role: el panel la llama
--    desde el servidor después de validar la sesión de admin.

begin;

-- 1. Origen de la reserva ----------------------------------------------------

alter table public.appointments
  add column if not exists booking_source text not null default 'manual';

alter table public.appointments
  drop constraint if exists appointments_booking_source_check;
alter table public.appointments
  add constraint appointments_booking_source_check
  check (booking_source in ('manual', 'public_link', 'public_qr'));

-- El backfill no debe pasar por las validaciones de plan/solo lectura ni
-- tocar updated_at. Se reactivan antes del commit.
alter table public.appointments disable trigger enforce_appointment_patient_limit;
alter table public.appointments disable trigger set_appointments_updated_at;

update public.appointments
set booking_source = 'public_link'
where booking_source = 'manual'
  and notes = 'Reserva creada desde enlace público.';

alter table public.appointments enable trigger enforce_appointment_patient_limit;
alter table public.appointments enable trigger set_appointments_updated_at;

create index if not exists appointments_created_at_idx
  on public.appointments (created_at);

-- 2. Intentos de login al panel ----------------------------------------------

create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_ip_time_idx
  on public.admin_login_attempts (ip, attempted_at desc);

-- Sin policies: solo service_role (que saltea RLS) lee y escribe.
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from anon, authenticated;

-- 3. KPIs semanales -----------------------------------------------------------

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
