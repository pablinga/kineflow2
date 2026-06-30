create or replace function public.ensure_profile_personal_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_workspace_id uuid;
  target_email text;
begin
  if coalesce(new.account_type, 'KINESIOLOGO') <> 'KINESIOLOGO' then
    return new;
  end if;

  target_email := lower(coalesce(new.email, (
    select auth_users.email
    from auth.users auth_users
    where auth_users.id = new.id
  )));

  insert into public.workspaces (
    type,
    owner_id,
    name,
    email,
    phone,
    responsible_name,
    color
  )
  values (
    'PERSONAL',
    new.id,
    coalesce(nullif(new.full_name, ''), 'Mi espacio'),
    target_email,
    new.phone,
    new.full_name,
    '#0b97dc'
  )
  on conflict do nothing;

  select workspaces.id
    into target_workspace_id
  from public.workspaces
  where workspaces.type = 'PERSONAL'
    and workspaces.owner_id = new.id
  limit 1;

  if target_workspace_id is not null and target_email is not null then
    insert into public.workspace_members (
      workspace_id,
      user_id,
      email,
      role,
      status,
      invited_by,
      responded_at,
      color
    )
    values (
      target_workspace_id,
      new.id,
      target_email,
      'ADMIN',
      'accepted',
      new.id,
      now(),
      '#0b97dc'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$;
