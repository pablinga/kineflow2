insert into public.plans (
  code,
  name,
  description,
  account_type,
  price,
  currency,
  billing_period,
  max_patients,
  max_professionals,
  features
)
values (
  'CONSULTORIO',
  'Plan Consultorio',
  'Para consultorios y centros de rehabilitacion que necesitan administrar pacientes, agenda multi-profesional e ingresos por profesional.',
  'CONSULTORIO',
  30000,
  'ARS',
  'month',
  null,
  -1,
  '["Gestion de pacientes del consultorio", "Agenda multi-profesional", "Busqueda de kinesiologos por matricula", "Invitacion de kinesiologos registrados", "Control de sesiones por profesional", "Reportes e ingresos del consultorio", "Escala para equipos y clinicas"]'::jsonb
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  account_type = excluded.account_type,
  price = excluded.price,
  currency = excluded.currency,
  billing_period = excluded.billing_period,
  max_patients = excluded.max_patients,
  max_professionals = excluded.max_professionals,
  features = excluded.features,
  active = true,
  updated_at = now();
