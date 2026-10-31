-- Demo pública (/demo): evento demo_view en el embudo de adquisición.
alter table public.acquisition_events
  drop constraint if exists acquisition_events_event_type_check,
  add constraint acquisition_events_event_type_check check (event_type in
    ('landing_view', 'signup_started', 'profile_view', 'profile_footer_click', 'demo_view'));
