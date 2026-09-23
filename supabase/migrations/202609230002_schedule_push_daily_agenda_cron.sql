-- Resumen diario de turnos por push. Corre a las 10:00 UTC = 07:00 en
-- Argentina. Usa los mismos secretos de vault que el cron de recordatorios
-- de WhatsApp (202608280001).

select
  cron.schedule(
    'kineflow-push-daily-agenda',
    '0 10 * * *',
    $$
    select net.http_get(
      url => (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'kineflow_cron_base_url'
        limit 1
      ) || '/api/cron/push-daily-agenda',
      headers => jsonb_build_object(
        'x-vercel-protection-bypass',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vercel_automation_bypass_secret'
          limit 1
        ),
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'kineflow_cron_secret'
          limit 1
        )
      )
    );
    $$
  );
