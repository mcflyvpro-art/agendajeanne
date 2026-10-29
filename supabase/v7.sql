-- ============================================================================
--  AGENDA JEANNE — v7. À exécuter après v6. Idempotent, ne supprime rien.
-- ============================================================================

-- L'enfant enregistre elle-même les badges qu'elle débloque (tâche sans
-- validation, quiz). Sans cette règle l'écriture était refusée en silence :
-- le badge n'apparaissait jamais et son bonus était recrédité à chaque tâche.
drop policy if exists p_child_badge on earned_badges;
create policy p_child_badge on earned_badges for insert to authenticated
  with check (child_id = auth.uid());

-- Temps réel sur les objets débloqués : le tableau de bord parent les suit déjà.
do $$
begin
  alter publication supabase_realtime add table public.child_items;
exception
  when duplicate_object then null;
  when others then raise notice 'child_items: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
