alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

create or replace function public.get_account_access_level(target_account_id uuid)
returns text
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  has_active_paid boolean;
  trial_end timestamptz;
begin
  select exists (
    select 1
    from public.subscriptions
    where subscriptions.account_id = target_account_id
      and subscriptions.status = 'ACTIVE'
  ) into has_active_paid;

  if has_active_paid then
    return 'PAID_ACTIVE';
  end if;

  select profiles.trial_ends_at
    into trial_end
  from public.profiles
  where profiles.id = target_account_id;

  if trial_end is null or trial_end > now() then
    return 'TRIAL_ACTIVE';
  end if;

  return 'READ_ONLY';
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_account_type text;
  organization_name text;
begin
  new_account_type := coalesce(
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'accountType',
    'KINESIOLOGO'
  );

  if new_account_type not in ('KINESIOLOGO', 'CONSULTORIO') then
    new_account_type := 'KINESIOLOGO';
  end if;

  organization_name := coalesce(
    nullif(new.raw_user_meta_data->>'organization_name', ''),
    nullif(new.raw_user_meta_data->>'clinic_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'Consultorio'
  );

  insert into public.profiles (
    id,
    account_type,
    email,
    full_name,
    license_number,
    phone,
    specialty,
    organization_name,
    organization_address,
    responsible_name,
    role,
    trial_started_at,
    trial_ends_at
  )
  values (
    new.id,
    new_account_type,
    lower(new.email),
    case
      when new_account_type = 'CONSULTORIO' then organization_name
      else coalesce(new.raw_user_meta_data->>'full_name', 'Kinesiologo')
    end,
    case
      when new_account_type = 'KINESIOLOGO' then new.raw_user_meta_data->>'license_number'
      else null
    end,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',
    case when new_account_type = 'CONSULTORIO' then organization_name else null end,
    case
      when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'organization_address'
      else null
    end,
    case
      when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'responsible_name'
      else null
    end,
    case
      when new_account_type = 'CONSULTORIO' then 'clinic'
      else 'kinesiologist'
    end,
    now(),
    now() + interval '3 months'
  )
  on conflict (id) do update
  set
    account_type = excluded.account_type,
    email = excluded.email,
    full_name = excluded.full_name,
    license_number = excluded.license_number,
    phone = excluded.phone,
    specialty = excluded.specialty,
    organization_name = excluded.organization_name,
    organization_address = excluded.organization_address,
    responsible_name = excluded.responsible_name,
    role = excluded.role,
    trial_started_at = coalesce(public.profiles.trial_started_at, excluded.trial_started_at),
    trial_ends_at = coalesce(public.profiles.trial_ends_at, excluded.trial_ends_at),
    updated_at = now();

  if new_account_type = 'CONSULTORIO' then
    insert into public.clinics (
      owner_id,
      name,
      email,
      phone,
      address,
      responsible_name
    )
    values (
      new.id,
      organization_name,
      lower(new.email),
      new.raw_user_meta_data->>'phone',
      new.raw_user_meta_data->>'organization_address',
      new.raw_user_meta_data->>'responsible_name'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$;
