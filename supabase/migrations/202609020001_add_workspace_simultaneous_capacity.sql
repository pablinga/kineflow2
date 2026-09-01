alter table public.workspaces
  add column if not exists max_simultaneous_appointments integer not null default 1,
  add constraint workspaces_max_simultaneous_appointments_check
    check (max_simultaneous_appointments >= 1);
