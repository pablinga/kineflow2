-- Libera cada 5 minutos los turnos con seña sin pagar cuyo plazo venció
-- (/api/cron/deposit-expirations). Mismos secretos de vault que los demás crons.
-- Para deshacer: select cron.unschedule('kineflow-deposit-expirations');

select
  cron.schedule(
    'kineflow-deposit-expirations',
    '*/5 * * * *',
    $$
    select net.http_get(
      url => (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'kineflow_cron_base_url'
        limit 1
      ) || '/api/cron/deposit-expirations',
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
