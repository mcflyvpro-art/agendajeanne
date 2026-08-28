-- ============================================================================
--  AGENDA JEANNE — v6. À exécuter après v5. Idempotent, ne supprime rien.
-- ============================================================================

-- Une seule réaction par message, posée par l'enfant qui le reçoit.
alter table messages add column if not exists reaction text
  check (reaction in ('thumb_up','thumb_down','check','cross','heart'));

notify pgrst, 'reload schema';
