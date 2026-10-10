-- Inicio (usuario activo): indicadores calculados en la base.
--
-- get_dashboard_home(workspace, now): SECURITY INVOKER. Corre con los permisos
-- de quien llama, así que las RLS de appointments / patients / evolutions /
-- disponibilidad siguen aplicando: no puede devolver datos de otro profesional.
-- Además replica el alcance de useDashboardSummary: en el espacio PERSONAL (o
-- si quien llama no es staff de la clínica) solo cuenta sus propios turnos.
--
-- get_dashboard_reminders_sent(workspace, from, to): SECURITY DEFINER porque
-- appointment_notifications no tiene policies (solo service role). Devuelve
-- solo un número y solo si quien llama es staff del espacio; en el PERSONAL,
-- solo de sus propios turnos.
--
-- Fechas en hora de Argentina; semanas de lunes a domingo.

create or replace function public.get_dashboard_home(
  p_workspace_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  v_uid uuid := auth.uid();
  v_ws record;
  v_own_only boolean;
  v_today date := (p_now at time zone tz)::date;
  v_week_start date := date_trunc('week', (p_now at time zone tz)::date)::date;
  v_month_start date := date_trunc('month', (p_now at time zone tz)::date)::date;
  v_next_month date := (date_trunc('month', (p_now at time zone tz)::date) + interval '1 month')::date;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select id, type, owner_id, source_clinic_id, default_session_price
    into v_ws
    from public.workspaces
   where id = p_workspace_id;

  if v_ws.id is null then
    -- Sin acceso (RLS) o inexistente: nada que mostrar.
    return null;
  end if;

  v_own_only := v_ws.type = 'PERSONAL' or not public.is_workspace_staff(p_workspace_id);

  with appts as (
    select a.*,
           (a.scheduled_at at time zone tz)::date as local_date
      from public.appointments a
     where a.workspace_id = p_workspace_id
       and (not v_own_only or a.owner_id = v_uid)
  ),
  live as (
    -- "No cancelados": se excluyen cancelados y reprogramados (el reprogramado
    -- tiene su turno nuevo).
    select * from appts where status not in ('cancelled', 'rescheduled')
  ),
  week_days as (
    select d::date as day
      from generate_series(v_week_start, v_week_start + 6, interval '1 day') d
  ),
  blocked as (
    select blocked_date from public.workspace_blocked_dates
     where workspace_id = p_workspace_id
       and blocked_date between v_week_start and v_week_start + 6
  ),
  availability as (
    select weekday, starts_at, ends_at, valid_from, valid_to
      from public.independent_availability
     where v_ws.type = 'PERSONAL'
       and owner_id = v_ws.owner_id
       and active
    union all
    select cpa.weekday, cpa.starts_at, cpa.ends_at, cpa.valid_from, cpa.valid_to
      from public.clinic_professional_availability cpa
      join public.clinic_professionals cp on cp.id = cpa.clinic_professional_id
     where v_ws.type = 'CLINICA'
       and not v_own_only
       and cp.clinic_id = v_ws.source_clinic_id
       and cp.status = 'active'
       and cpa.active
  ),
  available as (
    select coalesce(sum(extract(epoch from (av.ends_at - av.starts_at)) / 60), 0)::int as minutes,
           (select count(*) from availability) as rows_count
      from week_days wd
      join availability av
        on av.weekday = extract(dow from wd.day)::int
       and (av.valid_from is null or av.valid_from <= wd.day)
       and (av.valid_to is null or av.valid_to >= wd.day)
     where wd.day not in (select blocked_date from blocked)
  ),
  weekly as (
    select gs::date as week_start,
           coalesce(sum(a.session_amount), 0)::numeric as amount
      from generate_series(v_week_start - 49, v_week_start, interval '7 days') gs
      left join appts a
        on a.payment_status = 'paid'
       and coalesce(a.paid_at, a.local_date) >= gs::date
       and coalesce(a.paid_at, a.local_date) < gs::date + 7
     group by gs
     order by gs
  )
  select jsonb_build_object(
    'today', v_today,
    'weekStart', v_week_start,
    'weekAppointments',
      (select count(*) from live where local_date between v_week_start and v_week_start + 6),
    'previousWeekAppointments',
      (select count(*) from live where local_date between v_week_start - 7 and v_week_start - 1),
    'weekBookedMinutes',
      (select coalesce(sum(duration_minutes), 0) from live where local_date between v_week_start and v_week_start + 6),
    -- null = no hay horarios cargados: el widget de ocupación se oculta.
    'weekAvailableMinutes',
      (select case when rows_count = 0 then null else minutes end from available),
    'monthCollected',
      (select coalesce(sum(session_amount), 0) from appts
        where payment_status = 'paid'
          and coalesce(paid_at, local_date) >= v_month_start
          and coalesce(paid_at, local_date) < v_next_month),
    -- Mismo criterio que "cobros pendientes" del Inicio: asistidos,
    -- particulares, con monto y sin cobrar (de cualquier fecha).
    'pendingPaymentCount',
      (select count(*) from appts
        where status = 'attended' and payment_status = 'pending'
          and payment_type = 'PARTICULAR' and coalesce(session_amount, 0) > 0),
    'pendingPaymentAmount',
      (select coalesce(sum(session_amount), 0) from appts
        where status = 'attended' and payment_status = 'pending'
          and payment_type = 'PARTICULAR' and coalesce(session_amount, 0) > 0),
    'activePatients',
      (select count(distinct patient_id) from live
        where local_date between v_today - 30 and v_today + 30),
    'monthAttended',
      (select count(*) from appts where status = 'attended'
        and local_date >= v_month_start and scheduled_at <= p_now),
    'monthCancelled',
      (select count(*) from appts where status = 'cancelled'
        and local_date >= v_month_start and scheduled_at <= p_now),
    'monthNoShow',
      (select count(*) from appts where status = 'no_show'
        and local_date >= v_month_start and scheduled_at <= p_now),
    -- Valor de las ausencias: monto del turno o, si no tiene (session_amount
    -- es not null y vale 0 por defecto), el precio por defecto del espacio.
    -- null si ninguna tiene precio.
    'monthNoShowAmount',
      (select case when count(*) filter (where coalesce(nullif(session_amount, 0), v_ws.default_session_price) is not null) = 0
                   then null
                   else sum(coalesce(nullif(session_amount, 0), v_ws.default_session_price, 0)) end
         from appts where status = 'no_show'
          and local_date >= v_month_start and scheduled_at <= p_now),
    'weeklyIncome',
      (select coalesce(jsonb_agg(jsonb_build_object('weekStart', week_start, 'amount', amount) order by week_start), '[]'::jsonb) from weekly),
    -- Tuvieron turno en los últimos 30 días, no tienen turnos futuros y siguen
    -- activos (no hay estado "alta": se usa patients.status).
    'patientsWithoutNextAppointment',
      (select count(distinct l.patient_id)
         from live l
         join public.patients p on p.id = l.patient_id and p.status = 'active'
        where l.scheduled_at < p_now
          and l.local_date >= v_today - 30
          and not exists (
            select 1 from live f
             where f.patient_id = l.patient_id and f.scheduled_at >= p_now
          )),
    -- Turnos asistidos de los últimos 30 días sin evolución: vinculada por
    -- appointment_id o, si no, del mismo paciente y fecha.
    'sessionsWithoutEvolution',
      (select count(*) from appts a
        where a.status = 'attended'
          and a.local_date >= v_today - 30
          and a.scheduled_at <= p_now
          and not exists (
            select 1 from public.evolutions e
             where e.appointment_id = a.id
                or (e.appointment_id is null and e.patient_id = a.patient_id and e.session_date = a.local_date)
          )),
    'unregisteredAttendance',
      (select count(*) from appts where status = 'pending' and scheduled_at < p_now),
    'monthOnlineBookings',
      (select count(*) from appts
        where booking_source in ('public_link', 'public_qr')
          and (created_at at time zone tz)::date >= v_month_start
          and (created_at at time zone tz)::date < v_next_month)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_home(uuid, timestamptz) from public, anon;
grant execute on function public.get_dashboard_home(uuid, timestamptz) to authenticated;

create or replace function public.get_dashboard_reminders_sent(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_workspace_staff(p_workspace_id) then null
    else (
      select count(*)::int
        from public.appointment_notifications n
        join public.appointments a on a.id = n.appointment_id
        join public.workspaces w on w.id = a.workspace_id
       where a.workspace_id = p_workspace_id
         and (w.type <> 'PERSONAL' or a.owner_id = auth.uid())
         and n.notification_type = 'reminder'
         and n.status = 'sent'
         and n.sent_at >= p_from
         and n.sent_at < p_to
    )
  end;
$$;

revoke all on function public.get_dashboard_reminders_sent(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_dashboard_reminders_sent(uuid, timestamptz, timestamptz) to authenticated;
