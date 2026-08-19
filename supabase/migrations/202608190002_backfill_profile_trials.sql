update public.profiles
set
  trial_started_at = coalesce(trial_started_at, now()),
  trial_ends_at = coalesce(trial_ends_at, now() + interval '3 months'),
  updated_at = now()
where not exists (
  select 1
  from public.subscriptions
  where subscriptions.account_id = profiles.id
    and subscriptions.status = 'ACTIVE'
);
