-- Piezas para redes servidas en una URL pública: /social/<id>.jpg genera la
-- imagen a partir de estos campos (plantilla "promo", ver
-- src/lib/content/promo-image.ts). Así un programador externo (Metricool)
-- toma la imagen de una URL, sin subir archivos.
-- RLS activado y SIN policies: ni anónimos ni usuarios de la app leen ni
-- escriben; la ruta usa el service role y las filas se cargan con SQL.
-- Las filas no se editan: un cambio de diseño es una fila nueva (la imagen
-- se cachea como inmutable).

create table if not exists public.social_images (
  id uuid primary key default gen_random_uuid(),
  -- Nombre interno para encontrarla (ej. "2026-10-24 perfil con reservas").
  label text not null default '' check (char_length(label) <= 120),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.social_images enable row level security;

revoke all on table public.social_images from anon, authenticated;
