-- ============================================================================
--  AGENDA JEANNE — schéma complet
--  À coller dans : Supabase Dashboard → SQL Editor → Run
--  Idempotent : peut être relancé sans casser les données existantes.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- PROFILS --
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'parent' check (role in ('parent','child')),
  display_name  text not null default 'Utilisateur',
  avatar_emoji  text not null default '🙂',
  color         text not null default '#7C5CFF',
  -- économie / progression
  coins         integer not null default 0,
  xp            integer not null default 0,
  streak_current integer not null default 0,
  streak_best    integer not null default 0,
  streak_freezes integer not null default 1,
  last_streak_day date,
  -- notifications
  push_subscription jsonb,
  push_enabled  boolean not null default false,
  push_checked_at timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- --------------------------------------------------------------- RÉGLAGES --
-- Une seule ligne (id = 1). TOUT est paramétrable par le parent.
create table if not exists settings (
  id integer primary key default 1 check (id = 1),

  -- Monnaie
  currency_name   text not null default 'Jeannots',
  currency_emoji  text not null default '🪙',

  -- Barème par défaut (surchargeable tâche par tâche)
  base_coins            integer not null default 10,   -- points de base par tâche
  coins_per_10min       integer not null default 5,    -- + par tranche de 10 min
  difficulty_mult       jsonb   not null default '{"1":0.75,"2":1,"3":1.5,"4":2}'::jsonb,
  punctuality_bonus_pct integer not null default 25,   -- démarrage dans les temps
  streak_bonus_pct      integer not null default 20,   -- série >= 3 jours
  quiz_coins_per_answer integer not null default 3,
  perfect_day_bonus     integer not null default 50,
  xp_per_level          integer not null default 250,

  -- Règles de contrainte par défaut
  default_require_photo      boolean not null default false,
  default_require_validation boolean not null default false,
  default_min_timer_pct      integer not null default 60,  -- % de la durée avant de pouvoir valider
  default_difficulty         integer not null default 2,

  -- Reports
  max_postpones_per_day integer not null default 2,
  postpone_minutes      integer not null default 20,

  -- Rappels & escalade (minutes ; négatif = avant l'heure)
  reminder_offsets     integer[] not null default '{-15,0,10,20}',
  parent_alert_after   integer not null default 20,  -- alerte parent si non démarré après N min
  evening_recap_time   time not null default '21:00',
  tomorrow_preview_time time not null default '20:30',
  morning_checkin_time  time not null default '08:30',

  -- Cadre de la journée (CNED : journée complète à la maison)
  day_start   time not null default '08:30',
  day_end     time not null default '18:00',
  max_daily_minutes integer not null default 300,

  -- Ton des notifications
  notif_tone text not null default 'ferme' check (notif_tone in ('doux','neutre','ferme','humour')),

  -- Divers
  child_id   uuid references profiles(id) on delete set null,
  timezone   text not null default 'Europe/Paris',
  goal_title text not null default 'Décrocher le Brevet',
  goal_date  date,
  updated_at timestamptz not null default now()
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- --------------------------------------------------------------- MATIÈRES --
create table if not exists subjects (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  emoji     text not null default '📘',
  color     text not null default '#7C5CFF',
  position  integer not null default 0,
  active    boolean not null default true
);

-- --------------------------------------------------------------- ROUTINES --
-- Modèles récurrents : génèrent automatiquement les tâches du jour.
create table if not exists routines (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  subject_id   uuid references subjects(id) on delete set null,
  days_of_week integer[] not null default '{1,2,3,4,5}',  -- 0=dim … 6=sam
  start_time   time not null,
  duration_min integer not null default 45,
  difficulty   integer not null default 2 check (difficulty between 1 and 4),
  is_flexible  boolean not null default false,
  coins        integer,
  require_photo      boolean,
  require_validation boolean,
  min_timer_pct      integer,
  link_url     text,
  subtasks     jsonb not null default '[]'::jsonb,
  active       boolean not null default true,
  valid_from   date not null default current_date,
  valid_to     date,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------- TÂCHES --
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references profiles(id) on delete cascade,
  created_by   uuid references profiles(id) on delete set null,
  routine_id   uuid references routines(id) on delete set null,
  subject_id   uuid references subjects(id) on delete set null,

  title        text not null,
  description  text,
  day          date not null,
  start_time   time,
  duration_min integer not null default 45,
  is_flexible  boolean not null default false,
  deadline_time time,
  difficulty   integer not null default 2 check (difficulty between 1 and 4),

  status text not null default 'todo'
    check (status in ('todo','doing','submitted','done','skipped','missed')),

  -- règles (null = hérite de settings)
  require_photo      boolean,
  require_validation boolean,
  min_timer_pct      integer,
  allow_postpone     boolean not null default true,

  -- contenu
  link_url       text,
  attachment_url text,
  voice_url      text,
  parent_note    text,

  -- économie
  coins        integer not null default 10,
  coins_awarded integer,
  xp_awarded   integer,

  -- exécution
  started_at    timestamptz,
  completed_at  timestamptz,
  validated_at  timestamptz,
  active_seconds integer not null default 0,
  postpone_count integer not null default 0,
  proof_url     text,
  proof_note    text,
  blocked_note  text,
  child_note    text,
  parent_reaction text,

  -- notifications
  reminders_sent integer[] not null default '{}',
  parent_alerted boolean not null default false,

  created_at timestamptz not null default now()
);
create index if not exists tasks_day_idx on tasks(child_id, day);
create index if not exists tasks_status_idx on tasks(status);

create table if not exists subtasks (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references tasks(id) on delete cascade,
  label    text not null,
  done     boolean not null default false,
  position integer not null default 0
);
create index if not exists subtasks_task_idx on subtasks(task_id);

-- ------------------------------------------------------------ RÉCOMPENSES --
create table if not exists rewards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  emoji       text not null default '🎁',
  cost        integer not null default 100,
  category    text not null default 'Divers',
  condition   text,                       -- ex : « seulement si la semaine est complète »
  stock       integer,                    -- null = illimité
  limit_per_week integer,
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists redemptions (
  id         uuid primary key default gen_random_uuid(),
  reward_id  uuid references rewards(id) on delete set null,
  child_id   uuid not null references profiles(id) on delete cascade,
  reward_name text not null,
  reward_emoji text not null default '🎁',
  cost_paid  integer not null,
  status     text not null default 'pending' check (status in ('pending','approved','refused','delivered')),
  child_note text,
  parent_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ------------------------------------------------------- GRAND LIVRE (€) --
create table if not exists ledger (
  id        uuid primary key default gen_random_uuid(),
  child_id  uuid not null references profiles(id) on delete cascade,
  amount    integer not null,             -- + gagné, - dépensé
  reason    text not null,
  kind      text not null default 'task' check (kind in ('task','quiz','bonus','penalty','reward','manual','contract')),
  ref_id    uuid,
  created_at timestamptz not null default now()
);
create index if not exists ledger_child_idx on ledger(child_id, created_at desc);

-- ---------------------------------------------------------------- BADGES --
create table if not exists badges (
  code        text primary key,
  name        text not null,
  emoji       text not null,
  description text not null,
  rule_kind   text not null,   -- streak | tasks_total | perfect_days | quiz_score | early_bird | contracts
  rule_value  integer not null,
  coins_reward integer not null default 0
);

create table if not exists earned_badges (
  child_id  uuid not null references profiles(id) on delete cascade,
  code      text not null references badges(code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (child_id, code)
);

-- ------------------------------------------------------- CONTRAT HEBDO --
create table if not exists contracts (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  title      text not null,
  metric     text not null default 'tasks_done' check (metric in ('tasks_done','coins','minutes','perfect_days')),
  target     integer not null,
  reward_text text not null,
  reward_coins integer not null default 0,
  status     text not null default 'proposed' check (status in ('proposed','accepted','achieved','failed')),
  child_message text,
  created_at timestamptz not null default now(),
  unique (child_id, week_start)
);

-- --------------------------------------------------------------- MESSAGES --
create table if not exists messages (
  id        uuid primary key default gen_random_uuid(),
  from_id   uuid references profiles(id) on delete set null,
  to_id     uuid not null references profiles(id) on delete cascade,
  task_id   uuid references tasks(id) on delete set null,
  kind      text not null default 'message' check (kind in ('message','kudos','blocked','alert','system')),
  body      text not null,
  emoji     text,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_to_idx on messages(to_id, created_at desc);

-- ---------------------------------------------------------------- HUMEUR --
create table if not exists moods (
  id       uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  day      date not null,
  mood     integer not null check (mood between 1 and 5),
  note     text,
  created_at timestamptz not null default now(),
  unique (child_id, day)
);

-- ------------------------------------------------------------------ QUIZ --
create table if not exists quizzes (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references profiles(id) on delete cascade,
  task_id    uuid references tasks(id) on delete set null,
  title      text not null,
  subject    text,
  source_url text,
  questions  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists quiz_attempts (
  id        uuid primary key default gen_random_uuid(),
  quiz_id   uuid not null references quizzes(id) on delete cascade,
  child_id  uuid not null references profiles(id) on delete cascade,
  answers   jsonb not null default '[]'::jsonb,
  score     integer not null default 0,
  total     integer not null default 0,
  coins_earned integer not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------ FILE DE NOTIFS --
create table if not exists notif_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  task_id      uuid references tasks(id) on delete set null,
  kind         text not null,
  title        text not null,
  body         text not null,
  url          text not null default '/',
  scheduled_at timestamptz not null,
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists notif_pending_idx on notif_queue(scheduled_at) where sent_at is null;

-- --------------------------------------------------- JOURNAL DU MOTEUR --
create table if not exists engine_log (
  id  bigserial primary key,
  ran_at timestamptz not null default now(),
  kind text not null,
  detail jsonb
);

-- ============================================================================
--  RLS
-- ============================================================================
alter table profiles       enable row level security;
alter table settings       enable row level security;
alter table subjects       enable row level security;
alter table routines       enable row level security;
alter table tasks          enable row level security;
alter table subtasks       enable row level security;
alter table rewards        enable row level security;
alter table redemptions    enable row level security;
alter table ledger         enable row level security;
alter table badges         enable row level security;
alter table earned_badges  enable row level security;
alter table contracts      enable row level security;
alter table messages       enable row level security;
alter table moods          enable row level security;
alter table quizzes        enable row level security;
alter table quiz_attempts  enable row level security;
alter table notif_queue    enable row level security;
alter table engine_log     enable row level security;

create or replace function is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'parent');
$$;

-- Règle générale de cette app familiale (2 utilisateurs) :
--   • le parent a tous les droits partout
--   • l'enfant lit tout ce qui le concerne et n'écrit que ses propres actions
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','subjects','routines','tasks','subtasks','rewards',
    'redemptions','ledger','badges','earned_badges','contracts','messages',
    'moods','quizzes','quiz_attempts','notif_queue','engine_log'
  ] loop
    execute format('drop policy if exists p_read on %I', t);
    execute format('drop policy if exists p_parent_all on %I', t);
    execute format('create policy p_read on %I for select to authenticated using (true)', t);
    execute format('create policy p_parent_all on %I for all to authenticated using (is_parent()) with check (is_parent())', t);
  end loop;
end $$;

-- Écritures autorisées à l'enfant
drop policy if exists p_child_profile on profiles;
create policy p_child_profile on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists p_child_task on tasks;
create policy p_child_task on tasks for update to authenticated
  using (child_id = auth.uid()) with check (child_id = auth.uid());

drop policy if exists p_child_subtask on subtasks;
create policy p_child_subtask on subtasks for update to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and t.child_id = auth.uid()));

drop policy if exists p_child_redeem on redemptions;
create policy p_child_redeem on redemptions for insert to authenticated
  with check (child_id = auth.uid());

drop policy if exists p_child_mood on moods;
create policy p_child_mood on moods for insert to authenticated with check (child_id = auth.uid());
drop policy if exists p_child_mood_u on moods;
create policy p_child_mood_u on moods for update to authenticated
  using (child_id = auth.uid()) with check (child_id = auth.uid());

drop policy if exists p_child_msg on messages;
create policy p_child_msg on messages for insert to authenticated with check (from_id = auth.uid());
drop policy if exists p_msg_read on messages;
create policy p_msg_read on messages for update to authenticated using (to_id = auth.uid());

drop policy if exists p_child_ledger on ledger;
create policy p_child_ledger on ledger for insert to authenticated with check (child_id = auth.uid());

drop policy if exists p_child_quiz on quizzes;
create policy p_child_quiz on quizzes for insert to authenticated with check (child_id = auth.uid());
drop policy if exists p_child_attempt on quiz_attempts;
create policy p_child_attempt on quiz_attempts for insert to authenticated with check (child_id = auth.uid());

drop policy if exists p_child_contract on contracts;
create policy p_child_contract on contracts for update to authenticated
  using (child_id = auth.uid()) with check (child_id = auth.uid());

-- ============================================================================
--  PROFILS AUTOMATIQUES
-- ============================================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Profils des comptes déjà créés
insert into profiles (id, role, display_name, avatar_emoji, color, streak_freezes)
values ('35636ba3-e3e6-4fd7-ac2d-bff5e8f32631', 'child',  'Jeanne',   '🦊', '#7C5CFF', 1)
on conflict (id) do update set role = 'child', display_name = 'Jeanne';

insert into profiles (id, role, display_name, avatar_emoji, color)
values ('139866e3-1e62-4c04-91f2-1f238f0ca489', 'parent', 'Parent', '👤', '#2FD8A5')
on conflict (id) do update set role = 'parent';

update settings set child_id = '35636ba3-e3e6-4fd7-ac2d-bff5e8f32631' where id = 1;

-- ============================================================================
--  DONNÉES DE DÉPART
-- ============================================================================
insert into subjects (name, emoji, color, position) values
  ('Maths',      '📐', '#7C5CFF', 1),
  ('Français',   '📖', '#FF6B6B', 2),
  ('Histoire-Géo','🌍', '#FFC44D', 3),
  ('Anglais',    '🇬🇧', '#4DA6FF', 4),
  ('SVT',        '🌱', '#2FD8A5', 5),
  ('Physique-Chimie','⚗️','#E879F9', 6),
  ('Espagnol',   '🇪🇸', '#FB923C', 7),
  ('Techno',     '🔧', '#94A3B8', 8),
  ('Brevet',     '🎯', '#F43F5E', 9),
  ('Perso',      '✨', '#A78BFA', 10)
on conflict do nothing;

insert into badges (code, name, emoji, description, rule_kind, rule_value, coins_reward) values
  ('start_1',    'Premier pas',        '👟', 'Ta toute première tâche terminée',       'tasks_total', 1,   20),
  ('tasks_10',   'Ça démarre',         '🔥', '10 tâches terminées',                    'tasks_total', 10,  50),
  ('tasks_50',   'Sérieuse',           '💪', '50 tâches terminées',                    'tasks_total', 50,  150),
  ('tasks_200',  'Machine de guerre',  '⚡', '200 tâches terminées',                   'tasks_total', 200, 500),
  ('streak_3',   'Trois jours',        '🌱', '3 jours d''affilée',                     'streak',      3,   30),
  ('streak_7',   'Semaine pleine',     '🌟', '7 jours d''affilée',                     'streak',      7,   100),
  ('streak_30',  'Un mois entier',     '👑', '30 jours d''affilée',                    'streak',      30,  600),
  ('perfect_1',  'Journée parfaite',   '💎', 'Toutes les tâches d''une journée',       'perfect_days',1,   40),
  ('perfect_10', 'Dix sur dix',        '🏆', '10 journées parfaites',                  'perfect_days',10,  250),
  ('quiz_100',   'Sans faute',         '🧠', 'Un quiz réussi à 100 %',                 'quiz_score',  100, 60),
  ('early_5',    'Lève-tôt',           '🌅', '5 démarrages avant l''heure prévue',     'early_bird',  5,   60),
  ('contract_1', 'Parole tenue',       '🤝', 'Un contrat hebdomadaire rempli',         'contracts',   1,   100)
on conflict (code) do nothing;

insert into rewards (name, description, emoji, cost, category, position) values
  ('1 h de téléphone en plus', 'Une heure de rab, un soir de ton choix',      '📱', 150, 'Écran',   1),
  ('Soirée série/film',        'Tu choisis le film, on regarde ensemble',      '🍿', 250, 'Écran',   2),
  ('Sortie avec les copines',  'Un après-midi libre, validé à l''avance',      '👯', 500, 'Sorties', 3),
  ('10 € d''argent de poche',  'Versés le dimanche',                           '💶', 800, 'Argent',  4),
  ('20 € d''argent de poche',  'Versés le dimanche',                           '💰', 1500,'Argent',  5),
  ('Tu choisis le resto',      'Le repas du dimanche, c''est toi qui décides',  '🍽️', 300, 'Famille', 6),
  ('Grasse matinée',           'Un samedi sans réveil, sans reproche',          '😴', 200, 'Repos',   7),
  ('Zéro corvée pendant 2 j',  'Débarrassée de tout pendant deux jours',        '🧹', 350, 'Repos',   8)
on conflict do nothing;

notify pgrst, 'reload schema';

-- ============================================================================
--  STOCKAGE — photos de preuve et pièces jointes
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true), ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

do $$
begin
  drop policy if exists "family read"   on storage.objects;
  drop policy if exists "family write"  on storage.objects;
  drop policy if exists "family update" on storage.objects;
  drop policy if exists "family delete" on storage.objects;

  create policy "family read" on storage.objects for select
    using (bucket_id in ('proofs','attachments'));
  create policy "family write" on storage.objects for insert to authenticated
    with check (bucket_id in ('proofs','attachments'));
  create policy "family update" on storage.objects for update to authenticated
    using (bucket_id in ('proofs','attachments'));
  create policy "family delete" on storage.objects for delete to authenticated
    using (bucket_id in ('proofs','attachments'));
end $$;
