-- Publicador de contenido en las redes propias de KineFlow (Instagram y
-- página de Facebook). Solo lo usa el panel admin de la plataforma (/admin,
-- login propio) y los crons: todas las tablas tienen RLS activado y SIN
-- policies, así que ningún usuario de la app las puede leer ni escribir; el
-- servidor accede con el service role.

create table if not exists public.content_queue (
  id uuid primary key default gen_random_uuid(),
  -- Mismo contenido en IG y FB = 2 filas con el mismo group_id.
  group_id uuid not null default gen_random_uuid(),
  channel text not null check (channel in ('instagram', 'facebook')),
  format text not null default 'image' check (format in ('image', 'carousel')),
  template text,
  -- Textos de la plantilla (título, subtítulo, número...), para re-renderizar.
  template_fields jsonb not null default '{}'::jsonb,
  caption text not null default '' check (char_length(caption) <= 2200),
  hashtags text[] not null default '{}',
  -- Rutas dentro del bucket privado "social".
  image_paths text[] not null default '{}',
  link_url text,
  campaign text not null default 'organico'
    check (campaign ~ '^[a-z0-9._~-]{1,100}$'),
  scheduled_at timestamptz not null,
  status text not null default 'draft' check (
    status in ('draft', 'approved', 'publishing', 'published', 'failed', 'rejected', 'published_dry_run')
  ),
  approved_at timestamptz,
  approved_by text,
  published_at timestamptz,
  external_id text,
  permalink text,
  error text,
  attempts integer not null default 0,
  -- Reintento con backoff: no se toma antes de esta hora.
  next_attempt_at timestamptz,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_queue_images_required check (
    (format = 'image' and cardinality(image_paths) = 1)
    or (format = 'carousel' and cardinality(image_paths) between 2 and 10)
    or (channel = 'facebook' and cardinality(image_paths) = 0 and link_url is not null)
  )
);

create index if not exists content_queue_status_scheduled_idx
  on public.content_queue (status, scheduled_at);
create index if not exists content_queue_group_idx
  on public.content_queue (group_id);
create index if not exists content_queue_created_at_idx
  on public.content_queue (created_at);

create or replace function public.set_content_queue_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger content_queue_set_updated_at
  before update on public.content_queue
  for each row execute function public.set_content_queue_updated_at();

alter table public.content_queue enable row level security;

-- Links de aprobación por mail: de un solo uso. El link lleva una firma HMAC
-- (CONTENT_APPROVAL_SECRET) del id de esta fila; acá se marca el uso.
create table if not exists public.content_approval_links (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_queue (id) on delete cascade,
  action text not null check (action in ('approve', 'reject')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_approval_links_content_idx
  on public.content_approval_links (content_id);

alter table public.content_approval_links enable row level security;

-- Bucket privado para las piezas. Meta recibe una URL firmada corta generada
-- al publicar (descarga la imagen una sola vez al crear el contenedor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social', 'social', false, 8388608, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Crons: mismos secretos de vault que los demás (202608280001). Cada proyecto
-- de Supabase apunta a su propio ambiente (QA -> qa.kineflow.ar).
-- cron.schedule con un nombre existente actualiza ese job (idempotente).

select
  cron.schedule(
    'kineflow-content-publish',
    '*/15 * * * *',
    $$
    select net.http_get(
      url => (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'kineflow_cron_base_url' limit 1
      ) || '/api/cron/content-publish',
      headers => jsonb_build_object(
        'x-vercel-protection-bypass',
        (select decrypted_secret from vault.decrypted_secrets
          where name = 'vercel_automation_bypass_secret' limit 1),
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
          where name = 'kineflow_cron_secret' limit 1)
      ),
      timeout_milliseconds => 60000
    );
    $$
  );

-- Resumen diario de borradores: 11:45 UTC = 08:45 en Argentina.
select
  cron.schedule(
    'kineflow-content-digest',
    '45 11 * * *',
    $$
    select net.http_get(
      url => (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'kineflow_cron_base_url' limit 1
      ) || '/api/cron/content-digest',
      headers => jsonb_build_object(
        'x-vercel-protection-bypass',
        (select decrypted_secret from vault.decrypted_secrets
          where name = 'vercel_automation_bypass_secret' limit 1),
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
          where name = 'kineflow_cron_secret' limit 1)
      ),
      timeout_milliseconds => 30000
    );
    $$
  );
