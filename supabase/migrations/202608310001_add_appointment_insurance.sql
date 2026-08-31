alter table public.appointments
  add column if not exists insurance_provider_id uuid references public.insurance_providers(id),
  add column if not exists insurance_member_number text;
