-- ============================================================================
--  AGENDA JEANNE — v5. À exécuter après v4. Idempotent, ne supprime rien.
-- ============================================================================

-- Un quiz créé par le parent et envoyé à l'enfant, plutôt que pris en photo par elle.
alter table quizzes add column if not exists source      text not null default 'child' check (source in ('child','parent'));
alter table quizzes add column if not exists assigned_by uuid references profiles(id) on delete set null;

-- Le parent peut couper la création de quiz côté enfant (évite les photos inutiles).
alter table settings add column if not exists child_can_create_quiz boolean not null default true;

notify pgrst, 'reload schema';
