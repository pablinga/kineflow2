-- Renovación diaria de los tokens OAuth de Mercado Pago de los profesionales
-- (señas). 09:17 UTC = 06:17 AR. Mismos secretos de vault que los demás crons.
-- Para deshacer: select cron.unschedule('kineflow-mp-token-refresh');

select
  cron.schedule(
    'kineflow-mp-token-refresh',
    '17 9 * * *',
    $$
    select net.http_get(
      url => (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'kineflow_cron_base_url'
        limit 1
      ) || '/api/cron/mp-token-refresh',
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
