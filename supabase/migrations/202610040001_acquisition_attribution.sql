-- Atribución de adquisición (UTM, first touch) y embudo de campañas.
--
-- - user_attribution: una fila por usuario registrado que llegó con UTM. La
--   llena el trigger on_auth_user_record_attribution a partir de
--   raw_user_meta_data->'attribution' (mismo patrón que la aceptación legal).
--   Equivale al evento signup_completed.
-- - acquisition_events: landing_view y signup_started de visitantes anónimos
--   con UTM (los escribe /api/acquisition/event con service role).
-- - outreach_contacts: a quién se le envió cada campaña (para calcular la
--   conversión email → visita → registro). Se carga a mano/CSV desde Supabase.
--
-- Privacidad: solo slugs en los UTM; landing sin query; referrer solo origen.
-- No modifica datos existentes.

begin;

-- Slug válido en minúsculas o null (sin "@": nunca un email).
create or replace function public.attribution_slug(value text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when value ~ '^[A-Za-z0-9._~-]{1,100}$' and position('@' in value) = 0
      then lower(value)
    else null
  end;
$function$;

create table if not exists public.user_attribution (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  visitor_id uuid,
  utm_source text not null,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_page text,
  referrer text,
  first_visited_at timestamptz,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_attribution_campaign_idx
  on public.user_attribution (utm_campaign, utm_content);
create index if not exists user_attribution_source_idx
  on public.user_attribution (utm_source);
create index if not exists user_attribution_visitor_idx
  on public.user_attribution (visitor_id);

alter table public.user_attribution enable row level security;

-- Cada usuario puede ver solo su propia atribución; nadie la escribe desde
-- el cliente (la inserta el trigger, security definer).
drop policy if exists "Users can read own attribution" on public.user_attribution;
create policy "Users can read own attribution"
  on public.user_attribution for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_attribution from anon;
revoke insert, update, delete on public.user_attribution from authenticated;
grant select on public.user_attribution to authenticated;

create table if not exists public.acquisition_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  event_type text not null check (event_type in ('landing_view', 'signup_started')),
  utm_source text not null,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_page text,
  referrer text,
  first_visited_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint acquisition_events_once unique (visitor_id, event_type, first_visited_at)
);

create index if not exists acquisition_events_campaign_idx
  on public.acquisition_events (utm_campaign, utm_content, event_type);
create index if not exists acquisition_events_created_idx
  on public.acquisition_events (created_at);

-- Sin policies: solo service_role (API route y consultas desde Supabase).
alter table public.acquisition_events enable row level security;
revoke all on public.acquisition_events from anon, authenticated;

create table if not exists public.outreach_contacts (
  id bigint generated always as identity primary key,
  campaign text not null check (public.attribution_slug(campaign) = campaign),
  utm_content text not null check (public.attribution_slug(utm_content) = utm_content),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint outreach_contacts_unique unique (campaign, utm_content)
);

alter table public.outreach_contacts enable row level security;
revoke all on public.outreach_contacts from anon, authenticated;

create or replace function public.record_signup_attribution()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  raw jsonb;
  source text;
  visited timestamptz;
  visitor uuid;
  landing text;
  ref text;
begin
  raw := new.raw_user_meta_data->'attribution';

  if raw is null or jsonb_typeof(raw) <> 'object' then
    return new;
  end if;

  source := public.attribution_slug(raw->>'utm_source');

  if source is null then
    return new;
  end if;

  begin
    visited := (raw->>'first_visited_at')::timestamptz;
  exception when others then
    visited := null;
  end;

  begin
    visitor := (raw->>'visitor_id')::uuid;
  exception when others then
    visitor := null;
  end;

  landing := split_part(split_part(coalesce(raw->>'landing_page', ''), '?', 1), '#', 1);
  landing := case when left(landing, 1) = '/' then left(landing, 300) else null end;
  ref := case
    when raw->>'referrer' ~ '^https?://[^/?#\s]+$' then left(raw->>'referrer', 300)
    else null
  end;

  insert into public.user_attribution (
    user_id, visitor_id, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, landing_page, referrer, first_visited_at
  )
  values (
    new.id,
    visitor,
    source,
    public.attribution_slug(raw->>'utm_medium'),
    public.attribution_slug(raw->>'utm_campaign'),
    public.attribution_slug(raw->>'utm_content'),
    public.attribution_slug(raw->>'utm_term'),
    landing,
    ref,
    visited
  )
  on conflict (user_id) do nothing;

  return new;
exception when others then
  -- La atribución nunca debe impedir un registro.
  raise warning 'record_signup_attribution: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_record_attribution on auth.users;
create trigger on_auth_user_record_attribution
  after insert on auth.users
  for each row execute function public.record_signup_attribution();

commit;
