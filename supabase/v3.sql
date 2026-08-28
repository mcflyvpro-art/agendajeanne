-- ============================================================================
--  AGENDA JEANNE — v3
--  ⚠️  LA PREMIÈRE SECTION EFFACE TOUTES LES DONNÉES DE JEU.
--      Tâches et routines sont conservées. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------- 1. REMISE À ZÉRO
truncate table quiz_attempts, quizzes, messages, ledger,
               earned_badges, redemptions, moods restart identity cascade;

delete from rewards;

update profiles set
  coins = 0, xp = 0, level_reached = 1,
  streak_current = 0, streak_best = 0, streak_freezes = 1, last_streak_day = null;

update tasks set
  status = case when status in ('done','submitted') then 'todo' else status end,
  coins_awarded = null, xp_awarded = null, active_seconds = 0,
  started_at = null, completed_at = null, validated_at = null,
  proof_url = null, proof_note = null, child_note = null, blocked_note = null,
  parent_reaction = null, postpone_count = 0, reminders_sent = '{}',
  parent_alerted = false, timer_running = false, timer_segment_at = null;

update contracts set status = 'proposed', child_message = null;

-- ------------------------------------------------- 2. BOUTIQUE : ACTION/OBJET
alter table rewards add column if not exists kind text not null default 'action'
  check (kind in ('action', 'item'));
alter table rewards add column if not exists item_type  text;   -- 'avatar' pour l'instant
alter table rewards add column if not exists item_value text;   -- l'emoji de l'avatar

-- Un même objet ne peut être proposé qu'une fois.
create unique index if not exists rewards_item_unique
  on rewards (item_type, item_value) where kind = 'item';

-- ------------------------------------------------------- 3. INVENTAIRE ENFANT
create table if not exists child_items (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references profiles(id) on delete cascade,
  reward_id   uuid references rewards(id) on delete set null,
  item_type   text not null,
  item_value  text not null,
  acquired_at timestamptz not null default now(),
  unique (child_id, item_type, item_value)
);
alter table child_items enable row level security;

drop policy if exists p_read       on child_items;
drop policy if exists p_parent_all on child_items;
drop policy if exists p_child_own  on child_items;
create policy p_read       on child_items for select to authenticated using (true);
create policy p_parent_all on child_items for all    to authenticated using (is_parent()) with check (is_parent());
create policy p_child_own  on child_items for insert to authenticated with check (child_id = auth.uid());

-- --------------------------------------------------------------- 4. HUMEURS
-- Plusieurs déclarations par jour deviennent possibles ; la limite est un réglage.
alter table moods drop constraint if exists moods_child_id_day_key;
create index if not exists moods_child_day_idx on moods (child_id, day);

alter table settings add column if not exists mood_per_day integer not null default 1;

-- --------------------------------------------------- 5. RÉCOMPENSES PAR DÉFAUT
-- Barème calé sur ~1 200 points pour une bonne semaine de travail.
insert into rewards (name, description, emoji, cost, category, kind, position) values
  ('1 h de téléphone',      'Une heure en plus, un soir au choix',  '📱', 150,  'Écran',   'action', 1),
  ('Choisir le repas',      'Tu décides du dîner',                  '🍽️', 200,  'Famille', 'action', 2),
  ('Grasse matinée',        'Un samedi sans réveil',                '😴', 250,  'Repos',   'action', 3),
  ('Soirée film',           'Tu choisis, on regarde ensemble',      '🍿', 350,  'Écran',   'action', 4),
  ('2 jours sans corvées',  'Débarrassée de tout pendant 48 h',     '🧹', 400,  'Repos',   'action', 5),
  ('Sortie avec les copines','Un après-midi libre, validé avant',   '👯', 600,  'Sorties', 'action', 6),
  ('10 € d''argent de poche','Versés le dimanche',                  '💶', 1200, 'Argent',  'action', 7),
  ('20 € d''argent de poche','Versés le dimanche',                  '💰', 2300, 'Argent',  'action', 8);

-- Avatars à débloquer : petites récompenses fréquentes, effet immédiat.
insert into rewards (name, description, emoji, cost, category, kind, item_type, item_value, position) values
  ('Chaton',      'Avatar',  '🐱', 80,  'Avatars', 'item', 'avatar', '🐱', 10),
  ('Fleur',       'Avatar',  '🌸', 90,  'Avatars', 'item', 'avatar', '🌸', 11),
  ('Pingouin',    'Avatar',  '🐧', 100, 'Avatars', 'item', 'avatar', '🐧', 12),
  ('Panda',       'Avatar',  '🐼', 120, 'Avatars', 'item', 'avatar', '🐼', 13),
  ('Nœud rose',   'Avatar',  '🎀', 130, 'Avatars', 'item', 'avatar', '🎀', 14),
  ('Papillon',    'Avatar',  '🦋', 150, 'Avatars', 'item', 'avatar', '🦋', 15),
  ('Chouette',    'Avatar',  '🦉', 180, 'Avatars', 'item', 'avatar', '🦉', 16),
  ('Licorne',     'Avatar',  '🦄', 200, 'Avatars', 'item', 'avatar', '🦄', 17),
  ('Pieuvre',     'Avatar',  '🐙', 220, 'Avatars', 'item', 'avatar', '🐙', 18),
  ('Éclair',      'Avatar',  '⚡', 250, 'Avatars', 'item', 'avatar', '⚡', 19),
  ('Flamme',      'Avatar',  '🔥', 300, 'Avatars', 'item', 'avatar', '🔥', 20),
  ('Dragon',      'Avatar',  '🐉', 350, 'Avatars', 'item', 'avatar', '🐉', 21),
  ('Étoile',      'Avatar',  '🌟', 400, 'Avatars', 'item', 'avatar', '🌟', 22),
  ('Couronne',    'Avatar',  '👑', 500, 'Avatars', 'item', 'avatar', '👑', 23);

-- Le renard de départ est offert.
insert into child_items (child_id, item_type, item_value)
select id, 'avatar', '🦊' from profiles where role = 'child'
on conflict do nothing;

update profiles set avatar_emoji = '🦊' where role = 'child';

-- ------------------------------------------------------------ 6. TEMPS RÉEL
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','subjects','routines','tasks','subtasks','rewards',
    'redemptions','ledger','messages','moods','contracts','earned_badges',
    'quizzes','quiz_attempts','child_items','badges'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when others then raise notice 'table %: %', t, sqlerrm;
    end;
  end loop;
end $$;

alter table profiles      replica identity full;
alter table tasks         replica identity full;
alter table redemptions   replica identity full;
alter table messages      replica identity full;
alter table rewards       replica identity full;
alter table child_items   replica identity full;
alter table quizzes       replica identity full;
alter table quiz_attempts replica identity full;
alter table ledger        replica identity full;
alter table moods         replica identity full;

notify pgrst, 'reload schema';
