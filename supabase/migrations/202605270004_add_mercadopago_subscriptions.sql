create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  account_type text not null,
  price numeric(12, 2) not null default 0,
  currency text not null default 'ARS',
  billing_period text not null default 'month',
  max_patients integer,
  max_professionals integer,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_account_type_check check (
    account_type in ('KINESIOLOGO', 'CONSULTORIO')
  ),
  constraint plans_billing_period_check check (billing_period in ('free', 'month'))
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null,
  plan_id uuid not null references public.plans(id),
  provider text not null default 'mercadopago',
  provider_subscription_id text,
  provider_status text,
  status text not null default 'PENDING_PAYMENT',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_account_type_check check (
    account_type in ('KINESIOLOGO', 'CONSULTORIO')
  ),
  constraint subscriptions_provider_check check (provider in ('mercadopago')),
  constraint subscriptions_status_check check (
    status in ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'CANCELLED', 'PAST_DUE', 'EXPIRED')
  )
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago',
  event_id text not null,
  event_type text,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_check check (provider in ('mercadopago'))
);

create unique index if not exists payment_events_provider_event_id_idx
  on public.payment_events(provider, event_id);
create unique index if not exists subscriptions_provider_subscription_idx
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index if not exists subscriptions_account_id_idx
  on public.subscriptions(account_id);
create index if not exists subscriptions_status_idx
  on public.subscriptions(status);

drop trigger if exists set_plans_updated_at on public.plans;
create trigger set_plans_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

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
values
  (
    'FREE',
    'Plan Free',
    'Para kinesiólogos que quieren probar KineFlow o trabajar operativamente para consultorios.',
    'KINESIOLOGO',
    0,
    'ARS',
    'free',
    5,
    null,
    '["Hasta 5 pacientes propios", "Agenda básica", "Evoluciones básicas", "Invitaciones de consultorios"]'::jsonb
  ),
  (
    'INDEPENDIENTE',
    'Plan Independiente',
    'Para kinesiólogos con práctica particular propia.',
    'KINESIOLOGO',
    14900,
    'ARS',
    'month',
    null,
    null,
    '["Pacientes propios", "Turnos propios", "Evoluciones propias", "Cobros propios", "Agenda unificada"]'::jsonb
  ),
  (
    'CONSULTORIO_2',
    'Plan Consultorio 2',
    'Para consultorios con hasta 2 kinesiólogos activos.',
    'CONSULTORIO',
    29900,
    'ARS',
    'month',
    null,
    2,
    '["Pacientes del consultorio", "Agenda multi-profesional", "Invitación de kinesiólogos", "Ingresos del consultorio"]'::jsonb
  ),
  (
    'CONSULTORIO_5',
    'Plan Consultorio 5',
    'Para consultorios con hasta 5 kinesiólogos activos.',
    'CONSULTORIO',
    49900,
    'ARS',
    'month',
    null,
    5,
    '["Pacientes del consultorio", "Agenda multi-profesional", "Invitación de kinesiólogos", "Ingresos del consultorio"]'::jsonb
  ),
  (
    'CONSULTORIO_10',
    'Plan Consultorio 10',
    'Para consultorios con hasta 10 kinesiólogos activos.',
    'CONSULTORIO',
    79900,
    'ARS',
    'month',
    null,
    10,
    '["Pacientes del consultorio", "Agenda multi-profesional", "Invitación de kinesiólogos", "Ingresos del consultorio"]'::jsonb
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

alter table public.profiles
  drop constraint if exists profiles_plan_check,
  add constraint profiles_plan_check check (
    plan in ('FREE', 'INDEPENDIENTE', 'CLINICA', 'CONSULTORIO_2', 'CONSULTORIO_5', 'CONSULTORIO_10')
  );

update public.profiles
set plan = 'CONSULTORIO_2'
where plan = 'CLINICA';

create or replace function public.set_default_plan_values()
returns trigger
as $function$
begin
  new.plan = coalesce(new.plan, 'FREE');
  new.estado_plan = coalesce(new.estado_plan, 'ACTIVO');
  new.fecha_inicio_plan = coalesce(new.fecha_inicio_plan, now());

  if new.plan = 'FREE' then
    new.limite_pacientes = 5;
    new.cantidad_kinesiologos = 1;
  elsif new.plan = 'INDEPENDIENTE' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 1;
  elsif new.plan = 'CONSULTORIO_2' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 2;
  elsif new.plan = 'CONSULTORIO_5' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 5;
  elsif new.plan = 'CONSULTORIO_10' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 10;
  end if;

  return new;
end;
$function$ language plpgsql;

create or replace function public.has_active_paid_plan(required_plan text default null)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.estado_plan = 'ACTIVO'
      and profiles.plan <> 'FREE'
      and (required_plan is null or profiles.plan = required_plan)
  )
  or exists (
    select 1
    from public.subscriptions
    join public.plans on plans.id = subscriptions.plan_id
    where subscriptions.account_id = auth.uid()
      and subscriptions.status = 'ACTIVE'
      and (required_plan is null or plans.code = required_plan)
  );
$function$;

create or replace function public.can_create_independent_practice_records()
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.account_type = 'KINESIOLOGO'
      and profiles.plan = 'INDEPENDIENTE'
      and profiles.estado_plan = 'ACTIVO'
  )
  or exists (
    select 1
    from public.subscriptions
    join public.plans on plans.id = subscriptions.plan_id
    where subscriptions.account_id = auth.uid()
      and subscriptions.status = 'ACTIVE'
      and plans.code = 'INDEPENDIENTE'
  );
$function$;

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "Anyone authenticated can read active plans" on public.plans;
create policy "Anyone authenticated can read active plans"
on public.plans for select
to authenticated
using (active);

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
on public.subscriptions for select
to authenticated
using (account_id = auth.uid());
