-- Suscripciones Web Push (PWA) por usuario y dispositivo.
-- Las escrituras las hace el backend con service role; el usuario solo puede
-- ver y borrar sus propias suscripciones.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Registro de notificaciones push enviadas, para no duplicar envíos si un cron
-- corre dos veces. Solo lo usa el backend (sin policies = sin acceso para
-- anon/authenticated).
create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref_key text not null,
  created_at timestamptz not null default now(),
  constraint push_notification_log_unique unique (user_id, kind, ref_key)
);

alter table public.push_notification_log enable row level security;
