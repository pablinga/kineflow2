-- Requiere las extensiones pg_cron y pg_net habilitadas (ya deberian
-- estarlo si el job manual esta funcionando en QA).

select
  cron.schedule(
    'kineflow-whatsapp-reminders',
    '0 * * * *',
    $$
    select net.http_get(
      url => (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'kineflow_cron_base_url'
        limit 1
      ) || '/api/cron/appointment-reminders',
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
