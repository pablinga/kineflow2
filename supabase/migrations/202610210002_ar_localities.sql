-- Maestro de localidades de Argentina (Georef / INDEC) para la ciudad del
-- perfil público: se elige de la lista (autocompletar desde 3 letras) y se
-- guarda el id, así el futuro buscador puede filtrar por ciudad o provincia.
--
-- - ar_localities: solo "Localidad simple" y "Componente de localidad
--   compuesta" (las "Entidad" son barrios/subdivisiones que duplican
--   ciudades). CABA se muestra como "Ciudad Autónoma de Buenos Aires (CABA)".
--   La carga de datos no está acá: ver supabase/queries/load-ar-localities.sql
--   (baja el archivo oficial con pg_net y llama a load_ar_localities).
-- - search_ar_localities(q): búsqueda sin tildes ni mayúsculas, con el orden
--   explicado en la función. Pública (son datos abiertos).
-- - workspace_public_profiles.locality_id reemplaza a city (city queda en
--   desuso: no se usaba en ningún perfil guardado).

create or replace function public.normalize_search_text(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(regexp_replace(
    lower(translate(coalesce(value, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create table if not exists public.ar_localities (
  id text primary key,
  name text not null,
  -- Nombre corto para títulos ("CABA").
  display_name text not null,
  province_id text not null,
  province_name text not null,
  department_name text,
  category text not null,
  -- Lo que se muestra en la lista ("San José, Buenos Aires (Almirante Brown)").
  label text not null,
  search_text text not null,
  lat double precision,
  lon double precision,
  source text not null default 'georef-ar (INDEC)',
  loaded_at timestamptz not null default now()
);

create index if not exists ar_localities_province_idx on public.ar_localities (province_id);

alter table public.ar_localities enable row level security;
revoke all on public.ar_localities from anon, authenticated;
grant select on public.ar_localities to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'ar_localities' and policyname = 'Anyone can read localities') then
    create policy "Anyone can read localities" on public.ar_localities
      for select to anon, authenticated using (true);
  end if;
end $$;

create or replace function public.search_ar_localities(query text, max_results integer default 8)
returns table (id text, label text, display_name text, province_name text)
language sql
stable
set search_path = public
as $$
  with q as (select public.normalize_search_text(query) as value)
  select l.id, l.label, l.display_name, l.province_name
  from public.ar_localities l, q
  where length(q.value) >= 3
    and (l.search_text like q.value || '%' or l.search_text like '% ' || q.value || '%')
  -- Primero la coincidencia exacta o de alias ("caba"), después las que
  -- empiezan con el texto y, a igualdad, las de aglomerados urbanos (Rosario,
  -- Córdoba, ...: el dataset no trae población).
  order by (public.normalize_search_text(l.name) = q.value
            or (position(' ' in q.value) = 0
                and (l.search_text like '% ' || q.value || ' %' or l.search_text like '% ' || q.value))) desc,
           (l.search_text like q.value || '%') desc,
           (l.category = 'Componente de localidad compuesta') desc,
           length(l.name), l.name, l.province_name
  limit least(greatest(coalesce(max_results, 8), 1), 20);
$$;

grant execute on function public.search_ar_localities(text, integer) to anon, authenticated;

-- Carga (idempotente) desde el JSON oficial de Georef
-- (https://infra.datos.gob.ar/georef/localidades.json). Solo service role.
create or replace function public.load_ar_localities(payload jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  loaded integer;
begin
  with raw as (
    select
      x->>'id' as id,
      case when x->'provincia'->>'id' = '02' then 'Ciudad Autónoma de Buenos Aires' else x->>'nombre' end as name,
      case when x->'provincia'->>'id' = '02' then 'CABA' else x->>'nombre' end as display_name,
      x->'provincia'->>'id' as province_id,
      x->'provincia'->>'nombre' as province_name,
      x->'departamento'->>'nombre' as department_name,
      x->>'categoria' as category,
      nullif(x->'centroide'->>'lat', '')::double precision as lat,
      nullif(x->'centroide'->>'lon', '')::double precision as lon
    from jsonb_array_elements(payload->'localidades') x
    where x->>'categoria' in ('Localidad simple', 'Componente de localidad compuesta')
  ),
  labeled as (
    select r.*,
      count(*) over (partition by public.normalize_search_text(r.name), r.province_id) as same_name
    from raw r
  )
  insert into public.ar_localities as l
    (id, name, display_name, province_id, province_name, department_name, category, label, search_text, lat, lon, loaded_at)
  select
    id, name, display_name, province_id, province_name, department_name, category,
    case
      when province_id = '02' then 'Ciudad Autónoma de Buenos Aires (CABA)'
      when same_name > 1 and department_name is not null then name || ', ' || province_name || ' (' || department_name || ')'
      else name || ', ' || province_name
    end,
    public.normalize_search_text(name)
      || case when province_id = '02' then ' caba capital federal buenos aires' else '' end,
    lat, lon, now()
  from labeled
  on conflict (id) do update set
    name = excluded.name, display_name = excluded.display_name,
    province_id = excluded.province_id, province_name = excluded.province_name,
    department_name = excluded.department_name, category = excluded.category,
    label = excluded.label, search_text = excluded.search_text,
    lat = excluded.lat, lon = excluded.lon, loaded_at = excluded.loaded_at;

  get diagnostics loaded = row_count;
  return loaded;
end;
$$;

revoke all on function public.load_ar_localities(jsonb) from public, anon, authenticated;

-- Perfil público: localidad del maestro.
alter table public.workspace_public_profiles
  add column if not exists locality_id text references public.ar_localities(id) on delete set null;

grant select (locality_id) on public.workspace_public_profiles to anon;
