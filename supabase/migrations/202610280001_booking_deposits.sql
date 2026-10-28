-- Señas en la reserva online, cobradas con la cuenta de Mercado Pago de cada
-- kinesiólogo particular (OAuth, modelo marketplace).
--
-- - mp_connections: vínculo OAuth por profesional. Los tokens se guardan
--   cifrados por la app (AES-256-GCM, MP_TOKEN_ENCRYPTION_KEY) y solo los lee
--   el service role: el profesional ve únicamente el estado de su conexión.
-- - deposit_settings: configuración de la seña por espacio (por ahora solo
--   espacios PERSONAL: la seña va a la cuenta del kinesiólogo dueño).
-- - appointments: estado 'awaiting_payment' (bloquea el horario porque
--   validate_appointment_schedule solo ignora 'cancelled') y columnas propias
--   de la seña. payment_status sigue siendo el cobro de la sesión.
--
-- Para deshacer: supabase/rollbacks/202610280001_booking_deposits_down.sql

-- 1. Conexiones de Mercado Pago -------------------------------------------

create table if not exists public.mp_connections (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null unique references public.profiles(id) on delete cascade,
  mp_user_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  live_mode boolean not null default false,
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'error')),
  last_refresh_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mp_connections_mp_user_id_idx on public.mp_connections (mp_user_id);
create index if not exists mp_connections_expires_at_idx
  on public.mp_connections (expires_at) where status = 'active';

alter table public.mp_connections enable row level security;

-- Los tokens no se pueden leer desde el cliente: grant solo de columnas sin
-- secretos y escritura reservada al service role.
revoke all on public.mp_connections from anon, authenticated;
grant select (id, professional_id, mp_user_id, live_mode, expires_at, status,
              last_refresh_at, last_error, connected_at, updated_at)
  on public.mp_connections to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'mp_connections' and policyname = 'Professional reads own mp connection') then
    create policy "Professional reads own mp connection" on public.mp_connections
      for select to authenticated using (professional_id = auth.uid());
  end if;
end
$$;

-- 2. Configuración de la seña ----------------------------------------------

create table if not exists public.deposit_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  deposit_enabled boolean not null default false,
  deposit_type text not null default 'fixed' check (deposit_type in ('fixed', 'percent')),
  deposit_value numeric(12, 2) not null default 0 check (deposit_value >= 0),
  payment_window_minutes integer not null default 30
    check (payment_window_minutes between 10 and 1440),
  cancellation_window_hours integer not null default 24
    check (cancellation_window_hours between 0 and 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_settings_percent_check
    check (deposit_type <> 'percent' or deposit_value <= 100),
  constraint deposit_settings_enabled_value_check
    check (not deposit_enabled or deposit_value > 0)
);

alter table public.deposit_settings enable row level security;

revoke all on public.deposit_settings from anon, authenticated;
grant select, insert, update on public.deposit_settings to authenticated;

-- Solo el dueño de un espacio PERSONAL. Las condiciones usan workspace_id de
-- la propia fila (insert().select() funciona, ver nota de RLS en CLAUDE.md).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'deposit_settings' and policyname = 'Owner reads deposit settings') then
    create policy "Owner reads deposit settings" on public.deposit_settings
      for select to authenticated
      using (exists (select 1 from public.workspaces w
                     where w.id = workspace_id and w.owner_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'deposit_settings' and policyname = 'Owner inserts deposit settings') then
    create policy "Owner inserts deposit settings" on public.deposit_settings
      for insert to authenticated
      with check (exists (select 1 from public.workspaces w
                          where w.id = workspace_id and w.owner_id = auth.uid()
                            and w.type = 'PERSONAL'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'deposit_settings' and policyname = 'Owner updates deposit settings') then
    create policy "Owner updates deposit settings" on public.deposit_settings
      for update to authenticated
      using (exists (select 1 from public.workspaces w
                     where w.id = workspace_id and w.owner_id = auth.uid()))
      with check (exists (select 1 from public.workspaces w
                          where w.id = workspace_id and w.owner_id = auth.uid()
                            and w.type = 'PERSONAL'));
  end if;
end
$$;

-- 3. Seña en los turnos ----------------------------------------------------

alter table public.appointments
  drop constraint if exists appointments_status_check,
  add constraint appointments_status_check check (
    status in ('pending', 'attended', 'cancelled', 'no_show', 'rescheduled', 'awaiting_payment')
  );

alter table public.appointments
  add column if not exists deposit_amount numeric(12, 2),
  add column if not exists deposit_status text,
  add column if not exists deposit_expires_at timestamptz,
  add column if not exists deposit_preference_id text,
  add column if not exists deposit_mp_payment_id text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_refund_id text,
  add column if not exists deposit_refunded_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

alter table public.appointments
  drop constraint if exists appointments_deposit_status_check,
  add constraint appointments_deposit_status_check check (
    deposit_status is null or deposit_status in
      ('awaiting', 'paid', 'rejected', 'expired', 'refunded', 'retained', 'refund_failed')
  ),
  drop constraint if exists appointments_deposit_amount_check,
  add constraint appointments_deposit_amount_check check (
    deposit_amount is null or deposit_amount > 0
  ),
  drop constraint if exists appointments_awaiting_payment_check,
  add constraint appointments_awaiting_payment_check check (
    status <> 'awaiting_payment'
    or (deposit_status = 'awaiting' and deposit_expires_at is not null and deposit_amount is not null)
  ),
  drop constraint if exists appointments_cancelled_by_check,
  add constraint appointments_cancelled_by_check check (
    cancelled_by is null or cancelled_by in ('patient', 'professional', 'system')
  );

create unique index if not exists appointments_deposit_mp_payment_id_key
  on public.appointments (deposit_mp_payment_id) where deposit_mp_payment_id is not null;
create index if not exists appointments_awaiting_payment_idx
  on public.appointments (deposit_expires_at) where status = 'awaiting_payment';
