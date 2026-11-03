-- Panel /admin: "Últimos ingresos" ordenado por última actividad real.
-- auth.users.last_sign_in_at solo cambia al escribir email y contraseña; con la
-- sesión abierta (PWA, celular) la gente usa la app semanas sin volver a loguearse.
-- La última actividad sale de auth.sessions (refreshed_at / updated_at), que se
-- actualiza al renovar el token. Solo la ejecuta service_role.

create or replace function public.admin_recent_activity(p_limit integer default 10)
returns table (
  user_id uuid,
  email text,
  last_sign_in_at timestamptz,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    u.last_sign_in_at,
    greatest(
      u.last_sign_in_at,
      (
        select max(coalesce(s.refreshed_at::timestamptz, s.updated_at))
        from auth.sessions s
        where s.user_id = u.id
      )
    ) as last_activity_at
  from auth.users u
  where u.last_sign_in_at is not null
  order by last_activity_at desc nulls last
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke all on function public.admin_recent_activity(integer) from public, anon, authenticated;
grant execute on function public.admin_recent_activity(integer) to service_role;
