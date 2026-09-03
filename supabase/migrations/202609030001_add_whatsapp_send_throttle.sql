create table if not exists public.whatsapp_send_throttle (
  phone_e164 text not null,
  workspace_id uuid not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (phone_e164, workspace_id, window_start)
);

alter table public.whatsapp_send_throttle enable row level security;

drop policy if exists "Service role full access" on public.whatsapp_send_throttle;
create policy "Service role full access"
on public.whatsapp_send_throttle for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.check_whatsapp_send_throttle(
  p_phone_e164 text,
  p_workspace_id uuid,
  p_window_minutes int,
  p_max_sends int
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
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60)
  );

  insert into public.whatsapp_send_throttle (phone_e164, workspace_id, window_start, count)
  values (p_phone_e164, p_workspace_id, v_window_start, 1)
  on conflict (phone_e164, workspace_id, window_start)
  do update set count = public.whatsapp_send_throttle.count + 1
  returning count into v_count;

  return v_count > p_max_sends;
end;
$function$;
