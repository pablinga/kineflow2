create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  legal_version text not null,
  created_at timestamptz not null default now()
);

alter table public.legal_acceptances enable row level security;

drop policy if exists "Users can read own legal acceptances" on public.legal_acceptances;
create policy "Users can read own legal acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own legal acceptances" on public.legal_acceptances;
create policy "Users can insert own legal acceptances"
  on public.legal_acceptances
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public.record_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_at_value timestamptz;
  legal_version_value text;
begin
  legal_version_value := nullif(new.raw_user_meta_data->>'legal_version', '');

  if legal_version_value is null then
    return new;
  end if;

  accepted_at_value := coalesce(
    nullif(new.raw_user_meta_data->>'legal_accepted_at', '')::timestamptz,
    now()
  );

  insert into public.legal_acceptances (
    user_id,
    accepted_at,
    legal_version
  )
  values (
    new.id,
    accepted_at_value,
    legal_version_value
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_record_legal_acceptance on auth.users;
create trigger on_auth_user_record_legal_acceptance
  after insert on auth.users
  for each row
  execute function public.record_signup_legal_acceptance();
