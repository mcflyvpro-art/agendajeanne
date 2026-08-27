-- ============================================================================
--  MOTEUR DE RAPPELS — à exécuter APRÈS le déploiement sur Vercel
--  Remplace les deux valeurs ci-dessous, puis lance ce script dans le SQL Editor.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
declare
  app_url     text := 'https://agendajeanne.vercel.app';
  cron_secret text := '55d47d49f6d9dd67a5e7dcf31dfa8cd606d73243471e24cd';
begin
  perform cron.unschedule('agenda-jeanne-tick')
    where exists (select 1 from cron.job where jobname = 'agenda-jeanne-tick');

  perform cron.schedule(
    'agenda-jeanne-tick',
    '* * * * *',                      -- toutes les minutes
    format(
      $q$select net.http_post(
           url     := %L,
           headers := jsonb_build_object('Content-Type','application/json','Authorization', %L),
           body    := '{}'::jsonb,
           timeout_milliseconds := 20000
         );$q$,
      app_url || '/api/cron/tick',
      'Bearer ' || cron_secret
    )
  );
end $$;

-- Vérifier que la tâche tourne :
--   select jobname, schedule, active from cron.job;
--   select status, start_time, return_message from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname='agenda-jeanne-tick')
--     order by start_time desc limit 10;
