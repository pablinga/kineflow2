-- Optional QA-only seed.
-- 1. Create a test user in Supabase Auth for kineflow-qa.
-- 2. Copy that user's UUID.
-- 3. Replace the UUID below and run this file in the SQL Editor.
-- This file intentionally creates only fictional patients, appointments and payments.

do $$
declare
  qa_user_id uuid := '00000000-0000-0000-0000-000000000000';
  patient_one_id uuid;
  patient_two_id uuid;
  appointment_one_id uuid;
  appointment_two_id uuid;
begin
  if qa_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace qa_user_id with the UUID of the QA Auth user before running this seed.';
  end if;

  if not exists (select 1 from auth.users where id = qa_user_id) then
    raise exception 'The QA Auth user % does not exist. Create it in Supabase Auth first.', qa_user_id;
  end if;

  insert into public.profiles (
    id,
    account_type,
    email,
    full_name,
    license_number,
    phone,
    specialty,
    role,
    plan,
    estado_plan,
    fecha_inicio_plan
  )
  values (
    qa_user_id,
    'KINESIOLOGO',
    'qa.kinesiologo@example.com',
    'Kinesiologo QA',
    'QA-12345',
    '+54 11 5555 0101',
    'Kinesiologia deportiva',
    'kinesiologist',
    'INDEPENDIENTE',
    'ACTIVO',
    now()
  )
  on conflict (id) do update
  set
    account_type = excluded.account_type,
    email = excluded.email,
    full_name = excluded.full_name,
    license_number = excluded.license_number,
    phone = excluded.phone,
    specialty = excluded.specialty,
    role = excluded.role,
    plan = excluded.plan,
    estado_plan = excluded.estado_plan,
    fecha_inicio_plan = excluded.fecha_inicio_plan,
    updated_at = now();

  delete from public.patients
  where owner_id = qa_user_id
    and document_number in ('QA-1001', 'QA-1002');

  insert into public.patients (
    owner_id,
    full_name,
    document_number,
    phone,
    email,
    initial_condition,
    status
  )
  values (
    qa_user_id,
    'Paciente QA Uno',
    'QA-1001',
    '+54 11 5555 0201',
    'paciente.qa.uno@example.com',
    'Dolor lumbar leve para prueba funcional',
    'active'
  )
  returning id into patient_one_id;

  insert into public.patients (
    owner_id,
    full_name,
    document_number,
    phone,
    email,
    initial_condition,
    status
  )
  values (
    qa_user_id,
    'Paciente QA Dos',
    'QA-1002',
    '+54 11 5555 0202',
    'paciente.qa.dos@example.com',
    'Rehabilitacion de rodilla ficticia',
    'active'
  )
  returning id into patient_two_id;

  insert into public.appointments (
    owner_id,
    patient_id,
    appointment_origin,
    scheduled_at,
    duration_minutes,
    modality,
    reason,
    status,
    session_amount,
    payment_status,
    payment_method,
    paid_at,
    payment_notes
  )
  values (
    qa_user_id,
    patient_one_id,
    'independent',
    now() + interval '1 day',
    45,
    'presencial',
    'Evaluacion inicial QA',
    'pending',
    12000,
    'pending',
    null,
    null,
    'Cobro ficticio pendiente'
  )
  returning id into appointment_one_id;

  insert into public.appointments (
    owner_id,
    patient_id,
    appointment_origin,
    scheduled_at,
    duration_minutes,
    modality,
    reason,
    status,
    session_amount,
    payment_status,
    payment_method,
    paid_at,
    payment_notes
  )
  values (
    qa_user_id,
    patient_two_id,
    'independent',
    now() - interval '2 days',
    60,
    'virtual',
    'Control evolutivo QA',
    'attended',
    15000,
    'paid',
    'transfer',
    current_date - 2,
    'Cobro ficticio pagado'
  )
  returning id into appointment_two_id;

  insert into public.evolutions (
    owner_id,
    patient_id,
    appointment_id,
    session_date,
    pain_level,
    mobility_notes,
    clinical_notes,
    next_goals
  )
  values (
    qa_user_id,
    patient_two_id,
    appointment_two_id,
    current_date - 2,
    3,
    'Movilidad ficticia mejorada para QA.',
    'Evolucion ficticia para validar la historia clinica.',
    'Continuar con ejercicios de prueba.'
  );
end $$;
