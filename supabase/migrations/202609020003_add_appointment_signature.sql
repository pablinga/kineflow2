alter table public.appointments
  add column if not exists signature_path text,
  add column if not exists signed_at timestamptz;
