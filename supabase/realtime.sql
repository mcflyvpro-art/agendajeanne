-- ============================================================================
--  TEMPS RÉEL — à exécuter dans le SQL Editor
--  Supabase n'émet aucun événement temps réel sur une table tant qu'elle n'est
--  pas ajoutée à la publication `supabase_realtime`. Sans ça, l'app doit être
--  rechargée à la main pour voir le solde, les tâches ou les messages changer.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','tasks','subtasks','rewards','redemptions',
    'ledger','messages','moods','contracts','earned_badges','quizzes'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- déjà publiée, rien à faire
      when others then raise notice 'table %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- Les UPDATE doivent transporter l'ancienne ligne pour que les filtres
-- côté client fonctionnent de façon fiable.
alter table profiles    replica identity full;
alter table tasks       replica identity full;
alter table redemptions replica identity full;
alter table messages    replica identity full;

-- Vérification : doit lister les 12 tables ci-dessus.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by tablename;
