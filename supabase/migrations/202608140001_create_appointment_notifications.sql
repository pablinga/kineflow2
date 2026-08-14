create table if not exists public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  notification_type text not null,
  status text not null default 'pending',
  provider text not null default 'twilio',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint appointment_notifications_type_check
    check (notification_type in ('confirmation', 'reminder')),
  constraint appointment_notifications_status_check
    check (status in ('pending', 'sent', 'failed'))
);

create index if not exists appointment_notifications_appointment_id_idx
  on public.appointment_notifications(appointment_id);
