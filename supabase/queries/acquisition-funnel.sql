-- Consultas de adquisición (atribución first-touch por UTM).
-- Correrlas en el SQL editor de Supabase (QA o prod). Solo lectura, salvo el
-- bloque 0 (carga de envíos de una campaña).
--
-- Tablas:
--   user_attribution   → registros completados (signup_completed), 1 por usuario
--   acquisition_events → landing_view / signup_started por visitante anónimo
--   outreach_contacts  → a quién se le envió cada campaña (emails enviados)

-- 0. Cargar los envíos de una campaña (un slug por clínica/contacto; nunca
--    emails ni nombres de personas).
-- insert into public.outreach_contacts (campaign, utm_content, sent_at)
-- values
--   ('clinicas_octubre_2026', 'clinica_abc', '2026-10-06 10:00-03'),
--   ('clinicas_octubre_2026', 'centro_xyz', '2026-10-06 10:00-03')
-- on conflict (campaign, utm_content) do nothing;

-- 1. Registros por utm_source.
select utm_source, count(*) as registros
from public.user_attribution
group by utm_source
order by registros desc;

-- 2. Registros por campaña.
select utm_source, utm_medium, utm_campaign, count(*) as registros
from public.user_attribution
group by utm_source, utm_medium, utm_campaign
order by registros desc;

-- 3. Registros por utm_content (prospecto), con la cuenta creada.
select ua.utm_campaign, ua.utm_content, p.account_type,
       coalesce(nullif(p.organization_name, ''), p.full_name) as cuenta,
       p.email, ua.first_visited_at, ua.registered_at
from public.user_attribution ua
join public.profiles p on p.id = ua.user_id
order by ua.registered_at desc;

-- 4. Conversión por campaña: enviados → visitas → signup iniciado → registro.
with sent as (
  select campaign, count(*) as emails_enviados
  from public.outreach_contacts group by campaign
), visits as (
  select utm_campaign as campaign,
         count(distinct visitor_id) filter (where event_type = 'landing_view') as visitas,
         count(distinct visitor_id) filter (where event_type = 'signup_started') as signup_iniciado
  from public.acquisition_events group by utm_campaign
), registros as (
  select utm_campaign as campaign, count(*) as signup_completado
  from public.user_attribution group by utm_campaign
)
select c.campaign,
       coalesce(s.emails_enviados, 0) as emails_enviados,
       coalesce(v.visitas, 0) as visitas,
       coalesce(v.signup_iniciado, 0) as signup_iniciado,
       coalesce(r.signup_completado, 0) as signup_completado,
       round(100.0 * coalesce(v.visitas, 0) / nullif(s.emails_enviados, 0), 1) as conv_email_visita_pct,
       round(100.0 * coalesce(r.signup_completado, 0) / nullif(v.visitas, 0), 1) as conv_visita_registro_pct,
       round(100.0 * coalesce(r.signup_completado, 0) / nullif(s.emails_enviados, 0), 1) as conv_email_registro_pct
from (
  select campaign from sent
  union select campaign from visits
  union select campaign from registros
) c
left join sent s using (campaign)
left join visits v using (campaign)
left join registros r using (campaign)
where c.campaign is not null
order by c.campaign;

-- 5. Embudo por prospecto (utm_content) de una campaña.
with params as (select 'clinicas_octubre_2026'::text as campaign),
prospects as (
  select utm_content from public.outreach_contacts, params where outreach_contacts.campaign = params.campaign
  union
  select utm_content from public.acquisition_events, params where utm_campaign = params.campaign
  union
  select utm_content from public.user_attribution, params where utm_campaign = params.campaign
)
select pr.utm_content as prospecto,
       (select oc.sent_at from public.outreach_contacts oc, params
         where oc.campaign = params.campaign and oc.utm_content = pr.utm_content) as enviado,
       (select min(e.created_at) from public.acquisition_events e, params
         where e.utm_campaign = params.campaign and e.utm_content = pr.utm_content
           and e.event_type = 'landing_view') as visito,
       (select min(e.created_at) from public.acquisition_events e, params
         where e.utm_campaign = params.campaign and e.utm_content = pr.utm_content
           and e.event_type = 'signup_started') as inicio_registro,
       (select min(ua.registered_at) from public.user_attribution ua, params
         where ua.utm_campaign = params.campaign and ua.utm_content = pr.utm_content) as se_registro
from prospects pr
where pr.utm_content is not null
order by se_registro nulls last, inicio_registro nulls last, visito nulls last, prospecto;
