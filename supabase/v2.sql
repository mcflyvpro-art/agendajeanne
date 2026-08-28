-- ============================================================================
--  AGENDA JEANNE — évolution v2
--  À coller dans Supabase → SQL Editor → Run. Idempotent.
-- ============================================================================

-- ------------------------------------------------ Réglages : XP & objectifs --
alter table settings add column if not exists xp_per_task        integer not null default 20;
alter table settings add column if not exists xp_per_quiz_answer integer not null default 5;
alter table settings add column if not exists level_up_coins     integer not null default 50;
alter table settings add column if not exists daily_xp_goal      integer not null default 60;

-- --------------------------------------- Réglages : préférences de notifs --
-- Ce que le PARENT accepte de recevoir
alter table settings add column if not exists notif_parent jsonb not null default '{
  "task_submitted": true, "quiz_done": true, "purchase": true, "badge": true,
  "level_up": true, "blocked": true, "mood": true, "not_started": true, "recap": true
}'::jsonb;

-- Ce que l'ENFANT reçoit
alter table settings add column if not exists notif_child jsonb not null default '{
  "task_created": true, "kudos": true, "reward_created": true, "contract_created": true,
  "reminders": true, "validation": true, "level_up": true
}'::jsonb;

-- --------------------------------------------- Tâches : minuteur en pause --
-- Le chrono ne tourne que si l'enfant est réellement sur la page.
alter table tasks add column if not exists timer_running    boolean not null default false;
alter table tasks add column if not exists timer_segment_at timestamptz;

-- ------------------------------------------------------- Humeur : emojis --
alter table moods add column if not exists code text;

-- ------------------------------------------------ Niveau atteint (profil) --
alter table profiles add column if not exists level_reached integer not null default 1;

-- ---------------------------------------------------- Suivi des tentatives --
create index if not exists quiz_attempts_quiz_idx on quiz_attempts(quiz_id, created_at desc);
create index if not exists quizzes_child_idx on quizzes(child_id, created_at desc);

notify pgrst, 'reload schema';
