create table if not exists public.public_booking_rate_limits (
  ip text not null,
  workspace_id uuid not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (ip, workspace_id, window_start)
);

alter table public.public_booking_rate_limits enable row level security;

drop policy if exists "Service role full access" on public.public_booking_rate_limits;
create policy "Service role full access"
on public.public_booking_rate_limits for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.check_booking_rate_limit(
  p_ip text,
  p_workspace_id uuid,
  p_window_minutes int,
  p_max_attempts int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := date_trunc('hour', now()) +
    (floor(extract(minute from now()) / p_window_minutes) * p_window_minutes) * interval '1 minute';

  insert into public.public_booking_rate_limits (ip, workspace_id, window_start, count)
  values (p_ip, p_workspace_id, v_window_start, 1)
  on conflict (ip, workspace_id, window_start)
  do update set count = public.public_booking_rate_limits.count + 1
  returning count into v_count;

  return v_count > p_max_attempts;
end;
$function$;
