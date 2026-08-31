alter table public.workspaces
  alter column default_session_price set default 30000,
  alter column default_session_duration_minutes set default 45;

update public.workspaces
set default_session_price = 30000
where default_session_price is null;

update public.workspaces
set default_session_duration_minutes = 45
where default_session_duration_minutes is null;
