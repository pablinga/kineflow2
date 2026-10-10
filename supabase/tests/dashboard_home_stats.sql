-- Prueba de get_dashboard_home (202610100002). Corre todo en una transacción
-- y hace rollback: no deja datos. Falla con una excepción si algo no coincide.
--   npx supabase db query --linked --project-ref <ref> -f supabase/tests/dashboard_home_stats.sql
--
-- "Ahora" fijo: miércoles 14/10/2026 12:00 en Argentina (15:00 UTC).
-- Semana actual: lunes 12/10 a domingo 18/10.

begin;

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_ws uuid;
  v_p1 uuid;
  v_p2 uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated', 'dash-test-a@kineflow.test', '', now(), '{"provider":"email"}', '{"full_name":"Test A","account_type":"KINESIOLOGO"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated', 'dash-test-b@kineflow.test', '', now(), '{"provider":"email"}', '{"full_name":"Test B","account_type":"KINESIOLOGO"}', now(), now());

  select id into v_ws from public.workspaces where owner_id = v_a and type = 'PERSONAL';
  update public.workspaces set default_session_price = 15000 where id = v_ws;

  insert into public.patients (owner_id, workspace_id, full_name, initial_condition, status, email, document_number)
  values (v_a, v_ws, 'Paciente Uno', 'Test', 'active', 'p1@kineflow.test', '30000001')
  returning id into v_p1;
  insert into public.patients (owner_id, workspace_id, full_name, initial_condition, status, email, document_number)
  values (v_a, v_ws, 'Paciente Dos', 'Test', 'active', 'p2@kineflow.test', '30000002')
  returning id into v_p2;

  insert into public.appointments (owner_id, workspace_id, patient_id, appointment_origin, scheduled_at, duration_minutes, modality, status, payment_status, payment_type, session_amount, paid_at, reason)
  values
    -- Domingo 11/10 23:30 AR (lunes 12 en UTC): semana ANTERIOR.
    (v_a, v_ws, v_p1, 'independent', '2026-10-12T02:30:00Z', 45, 'presencial', 'attended', 'pending', 'PARTICULAR', 0, null, 'Test'),
    -- Martes 13/10: semana actual, asistido y cobrado.
    (v_a, v_ws, v_p1, 'independent', '2026-10-13T13:00:00Z', 60, 'presencial', 'attended', 'paid', 'PARTICULAR', 20000, '2026-10-13', 'Test'),
    -- Jueves 15/10: semana actual, futuro.
    (v_a, v_ws, v_p1, 'independent', '2026-10-15T13:00:00Z', 45, 'presencial', 'pending', 'pending', 'PARTICULAR', 0, null, 'Test'),
    -- Domingo 18/10 23:30 AR (lunes 19 en UTC): semana ACTUAL.
    (v_a, v_ws, v_p1, 'independent', '2026-10-19T02:30:00Z', 30, 'presencial', 'pending', 'pending', 'PARTICULAR', 0, null, 'Test'),
    -- Miércoles 14/10 a la mañana, cancelado: no cuenta en la semana.
    (v_a, v_ws, v_p1, 'independent', '2026-10-14T12:00:00Z', 45, 'presencial', 'cancelled', 'pending', 'PARTICULAR', 0, null, 'Test'),
    -- Lunes 05/10: semana anterior; ausente sin monto (0: usa el precio del espacio).
    (v_a, v_ws, v_p2, 'independent', '2026-10-05T13:00:00Z', 45, 'presencial', 'no_show', 'pending', 'PARTICULAR', 0, null, 'Test');

  perform set_config('test.a', v_a::text, true);
  perform set_config('test.b', v_b::text, true);
  perform set_config('test.ws', v_ws::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.a'), 'role', 'authenticated')::text, true);

do $$
declare
  r jsonb := public.get_dashboard_home(current_setting('test.ws')::uuid, '2026-10-14T15:00:00Z');
begin
  if r is null then raise exception 'sin resultado para el dueño'; end if;

  if r->>'weekStart' <> '2026-10-12' then raise exception 'weekStart: %', r->>'weekStart'; end if;
  -- Semana lunes a domingo en hora de Argentina; cancelados fuera.
  if (r->>'weekAppointments')::int <> 3 then raise exception 'weekAppointments: %', r->>'weekAppointments'; end if;
  if (r->>'previousWeekAppointments')::int <> 2 then raise exception 'previousWeekAppointments: %', r->>'previousWeekAppointments'; end if;
  if (r->>'weekBookedMinutes')::int <> 135 then raise exception 'weekBookedMinutes: %', r->>'weekBookedMinutes'; end if;
  -- Sin horarios: null (no se divide por cero, el widget se oculta).
  if r->'weekAvailableMinutes' <> 'null'::jsonb then raise exception 'weekAvailableMinutes: %', r->'weekAvailableMinutes'; end if;
  if (r->>'monthAttended')::int <> 2 then raise exception 'monthAttended: %', r->>'monthAttended'; end if;
  if (r->>'monthCancelled')::int <> 1 then raise exception 'monthCancelled: %', r->>'monthCancelled'; end if;
  if (r->>'monthNoShow')::int <> 1 then raise exception 'monthNoShow: %', r->>'monthNoShow'; end if;
  if (r->>'monthNoShowAmount')::numeric <> 15000 then raise exception 'monthNoShowAmount: %', r->>'monthNoShowAmount'; end if;
  if (r->>'monthCollected')::numeric <> 20000 then raise exception 'monthCollected: %', r->>'monthCollected'; end if;
  -- Paciente Dos tuvo turno hace menos de 30 días y no tiene próximo.
  if (r->>'patientsWithoutNextAppointment')::int <> 1 then raise exception 'patientsWithoutNextAppointment: %', r->>'patientsWithoutNextAppointment'; end if;
  if (r->>'sessionsWithoutEvolution')::int <> 2 then raise exception 'sessionsWithoutEvolution: %', r->>'sessionsWithoutEvolution'; end if;
  if (r->>'activePatients')::int <> 2 then raise exception 'activePatients: %', r->>'activePatients'; end if;
  if jsonb_array_length(r->'weeklyIncome') <> 8 then raise exception 'weeklyIncome: %', r->'weeklyIncome'; end if;
  if (r->'weeklyIncome'->7->>'weekStart') <> '2026-10-12' or (r->'weeklyIncome'->7->>'amount')::numeric <> 20000 then
    raise exception 'weeklyIncome última semana: %', r->'weeklyIncome'->7;
  end if;
end;
$$;

-- Otro profesional no ve nada del espacio de A.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.b'), 'role', 'authenticated')::text, true);

do $$
begin
  if public.get_dashboard_home(current_setting('test.ws')::uuid, '2026-10-14T15:00:00Z') is not null then
    raise exception 'B ve los indicadores de A';
  end if;
  if public.get_dashboard_reminders_sent(current_setting('test.ws')::uuid, '2026-10-01', '2026-11-01') is not null then
    raise exception 'B ve los recordatorios de A';
  end if;
end;
$$;

-- Con horarios (lunes y miércoles 9 a 13) y el miércoles bloqueado: 240 min.
reset role;
insert into public.independent_availability (owner_id, weekday, starts_at, ends_at, active)
values (current_setting('test.a')::uuid, 1, '09:00', '13:00', true),
       (current_setting('test.a')::uuid, 3, '09:00', '13:00', true);
insert into public.workspace_blocked_dates (workspace_id, blocked_date)
values (current_setting('test.ws')::uuid, '2026-10-14');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.a'), 'role', 'authenticated')::text, true);

do $$
declare
  r jsonb := public.get_dashboard_home(current_setting('test.ws')::uuid, '2026-10-14T15:00:00Z');
begin
  if (r->>'weekAvailableMinutes')::int <> 240 then raise exception 'weekAvailableMinutes con horarios: %', r->>'weekAvailableMinutes'; end if;
end;
$$;

-- Mes sin turnos (noviembre): todo en cero, sin porcentajes inventados.
do $$
declare
  r jsonb := public.get_dashboard_home(current_setting('test.ws')::uuid, '2026-11-20T15:00:00Z');
begin
  if (r->>'monthAttended')::int + (r->>'monthCancelled')::int + (r->>'monthNoShow')::int <> 0 then
    raise exception 'mes sin turnos: %', r;
  end if;
  if r->'monthNoShowAmount' <> 'null'::jsonb then raise exception 'monthNoShowAmount sin ausencias: %', r->'monthNoShowAmount'; end if;
  if (r->>'monthCollected')::numeric <> 0 then raise exception 'monthCollected noviembre: %', r->>'monthCollected'; end if;
end;
$$;

select 'dashboard_home_stats: ok' as result;

rollback;
