-- ============================================================================
--  AGENDA JEANNE — v7. À exécuter après v6. Idempotent, ne supprime rien.
--
--  · « Travail sur téléphone » : le parent marque un devoir qui se fait hors de
--    l'app (manuel numérique, vidéo, appli). Le minuteur ne se met alors plus en
--    pause quand l'enfant quitte l'agenda — sans ça elle reste bloquée.
--  · Propriétaire du minuteur : l'appareil qui a lancé le chrono. Le téléphone
--    resté ouvert en poche ne met plus en pause le travail commencé sur le PC.
--  · Toutes les tables passent en temps réel, pour la synchro multi-appareils.
-- ============================================================================

alter table tasks    add column if not exists work_on_phone     boolean not null default false;
alter table tasks    add column if not exists timer_device      text;
alter table tasks    add column if not exists timer_device_kind text;
alter table routines add column if not exists work_on_phone     boolean not null default false;

-- Temps réel : sans publication, aucun évènement n'est émis et les appareils
-- doivent être rechargés à la main.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','settings','subjects','tasks','subtasks','routines',
    'rewards','redemptions','child_items','ledger','messages','moods',
    'contracts','badges','earned_badges','quizzes','quiz_attempts'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then raise notice 'table %: %', t, sqlerrm;
    end;
  end loop;
end $$;

alter table tasks       replica identity full;
alter table profiles    replica identity full;
alter table messages    replica identity full;
alter table redemptions replica identity full;

notify pgrst, 'reload schema';

-- ----------------------------------------------------- APPAREILS DE PUSH ----
-- Un abonnement push appartient à un navigateur, pas à une personne. Avec un
-- seul champ sur le profil, se connecter sur un deuxième appareil effaçait
-- l'abonnement du premier : les rappels n'arrivaient plus que sur le dernier
-- navigateur ouvert. Une ligne par appareil, et chacun reçoit.
create table if not exists push_devices (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  device_id    text not null,
  kind         text,              -- 'desktop' | 'mobile'
  label        text,              -- « Mac », « iPhone », « PC Windows »
  endpoint     text not null,
  subscription jsonb not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (profile_id, device_id)
);
create index if not exists push_devices_profile_idx on push_devices(profile_id);

alter table push_devices enable row level security;

drop policy if exists p_read on push_devices;
create policy p_read on push_devices for select to authenticated using (true);
drop policy if exists p_parent_all on push_devices;
create policy p_parent_all on push_devices for all to authenticated
  using (is_parent()) with check (is_parent());

-- Chacun gère les abonnements de ses propres appareils.
drop policy if exists p_own_device on push_devices;
create policy p_own_device on push_devices for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

notify pgrst, 'reload schema';
