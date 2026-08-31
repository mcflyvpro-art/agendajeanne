-- ============================================================================
--  AGENDA JEANNE — v8. À exécuter après v7. Idempotent, ne supprime rien.
--
--  LE CHRONOMÈTRE DEVIENT UNE HORLOGE DE PRÉSENCE.
--
--  Règle unique, valable partout :
--     le temps s'accumule tant qu'AU MOINS UN appareil est présent,
--     et il s'arrête dès qu'il n'y en a plus.
--
--  « Présent » se lit différemment selon l'appareil :
--     · ordinateur → l'app est ouverte, même en arrière-plan, même minimisée ;
--     · téléphone  → l'app est affichée à l'écran ;
--     · tâche « travail sur téléphone » → toujours, l'enfant travaille hors
--       de l'app, c'est exactement ce qu'on lui demande.
--
--  La présence se prouve par un battement de cœur (`timer_heartbeat_at`).
--  S'il s'arrête — fenêtre fermée, ordinateur éteint, coupure, plantage — le
--  segment ouvert est refermé RÉTROACTIVEMENT au dernier battement. Aucune
--  heure fantôme ne peut donc être créditée, même si plus personne ne revient.
--
--  Tout passe par ces fonctions plutôt que par des `update` du client : elles
--  s'exécutent sous verrou (deux appareils ne peuvent pas se marcher dessus)
--  et n'utilisent que l'horloge du serveur (une pendule d'ordinateur mal
--  réglée ne fausse plus rien).
-- ============================================================================

alter table tasks add column if not exists timer_heartbeat_at timestamptz;
-- Pause volontaire : elle seule empêche un autre appareil présent de relancer.
alter table tasks add column if not exists timer_paused boolean not null default false;

/**
 * Qui est là, en ce moment, sur cette tâche.
 *
 * Une ligne par appareil. C'est ce qui permet la seule chose que le reste ne
 * savait pas faire : quand le téléphone s'en va alors que le PC est encore
 * ouvert, le chronomètre ne s'arrête pas une seule seconde — il n'a même pas
 * besoin d'être « repris ».
 */
create table if not exists task_presence (
  task_id      uuid not null references tasks(id) on delete cascade,
  device_id    text not null,
  profile_id   uuid references profiles(id) on delete cascade,
  kind         text,
  last_seen_at timestamptz not null default now(),
  primary key (task_id, device_id)
);
create index if not exists task_presence_seen_idx on task_presence(task_id, last_seen_at);

alter table task_presence enable row level security;
drop policy if exists p_read on task_presence;
create policy p_read on task_presence for select to authenticated using (true);
drop policy if exists p_parent_all on task_presence;
create policy p_parent_all on task_presence for all to authenticated
  using (is_parent()) with check (is_parent());
drop policy if exists p_own_presence on task_presence;
create policy p_own_presence on task_presence for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Délai au-delà duquel un segment est considéré orphelin. Large à dessein :
-- un onglet en arrière-plan ne bat plus qu'une fois par minute.
create or replace function timer_stale_seconds() returns integer
  language sql immutable as $$ select 150 $$;

-- Crédit accordé après le dernier battement : on suppose l'enfant présente
-- jusqu'au battement suivant, pas une seconde de plus.
create or replace function timer_grace_seconds() returns integer
  language sql immutable as $$ select 60 $$;

/**
 * Durée du segment ouvert, en secondes.
 *  · tâche « hors de l'app » : temps réel écoulé ;
 *  · sinon : tronqué au dernier battement de cœur ;
 *  · dans tous les cas : plafonné, pour qu'une tâche oubliée toute une nuit
 *    n'affiche pas huit heures de travail.
 */
create or replace function timer_segment_seconds(t public.tasks, p_at timestamptz default now())
returns integer language sql stable as $$
  select case
    when t.timer_running is not true or t.timer_segment_at is null then 0
    else greatest(0, least(
      floor(extract(epoch from (
        (case when coalesce(t.work_on_phone, false) then p_at
              else least(p_at, coalesce(t.timer_heartbeat_at, t.timer_segment_at)
                              + make_interval(secs => timer_grace_seconds()))
         end) - t.timer_segment_at
      )))::integer,
      greatest(10800, coalesce(t.duration_min, 45) * 120)
    ))
  end
$$;

/** Le segment ouvert est-il encore vivant ? */
create or replace function timer_is_live(t public.tasks) returns boolean
language sql stable as $$
  select coalesce(t.timer_running, false) and (
    coalesce(t.work_on_phone, false)
    or coalesce(t.timer_heartbeat_at, t.timer_segment_at)
       > now() - make_interval(secs => timer_stale_seconds())
  )
$$;

/** Horloge de référence : tous les appareils s'y calent. */
create or replace function server_now() returns timestamptz
  language sql stable as $$ select now() $$;

/* --------------------------------------------------------------- départ -- */

create or replace function timer_start(p_task uuid, p_device text, p_kind text)
returns public.tasks language plpgsql security invoker as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then return null; end if;

  insert into public.task_presence (task_id, device_id, profile_id, kind, last_seen_at)
  values (p_task, p_device, auth.uid(), p_kind, now())
  on conflict (task_id, device_id) do update set last_seen_at = now(), kind = excluded.kind;

  update public.tasks set
    status = 'doing',
    started_at = coalesce(t.started_at, now()),
    timer_running = true,
    timer_paused = false,
    timer_segment_at = now(),
    timer_heartbeat_at = now(),
    timer_device = p_device,
    timer_device_kind = p_kind
  where id = p_task returning * into t;
  return t;
end $$;

/* --------------------------------------------------- présence / reprise -- */

/**
 * Battement de cœur de l'appareil présent — et reprise en main si le chrono
 * est arrêté ou orphelin. C'est ce seul appel qui fait que revenir sur
 * l'app, depuis n'importe quel appareil, relance le chrono tout seul.
 *
 * `p_backfill` rattrape les secondes pendant lesquelles cet appareil était
 * présent mais empêché de parler au serveur (réseau coupé, onglet gelé par
 * le navigateur). Le rattrapage est doublement borné : par le plafond
 * ci-dessous et par le temps réellement écoulé — impossible d'inventer du
 * temps.
 */
create or replace function timer_touch(
  p_task uuid, p_device text, p_kind text, p_backfill integer default 0
) returns public.tasks language plpgsql security invoker as $$
declare
  t public.tasks;
  credit integer;
  real_elapsed integer;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then return null; end if;
  if t.status <> 'doing' then return t; end if;

  -- « Je suis là. »
  insert into public.task_presence (task_id, device_id, profile_id, kind, last_seen_at)
  values (p_task, p_device, auth.uid(), p_kind, now())
  on conflict (task_id, device_id)
  do update set last_seen_at = now(), kind = excluded.kind, profile_id = excluded.profile_id;

  if coalesce(t.timer_paused, false) then return t; end if;

  -- Segment vivant : n'importe quel appareil présent entretient le battement.
  -- C'est la présence qui compte, pas la propriété.
  if timer_is_live(t) then
    -- L'étiquette « appareil » suit qui travaille vraiment : si le propriétaire
    -- déclaré n'est plus présent, c'est moi que le parent doit voir.
    if t.timer_device is null or t.timer_device = p_device
       or not exists (
         select 1 from public.task_presence pr
          where pr.task_id = p_task and pr.device_id = t.timer_device
            and pr.last_seen_at > now() - make_interval(secs => timer_stale_seconds())
       )
    then
      update public.tasks set
        timer_heartbeat_at = now(), timer_device = p_device, timer_device_kind = p_kind
      where id = p_task returning * into t;
    else
      update public.tasks set timer_heartbeat_at = now() where id = p_task returning * into t;
    end if;
    return t;
  end if;

  -- Chrono arrêté, ou segment orphelin : on referme proprement, on rouvre.
  credit := timer_segment_seconds(t);
  if coalesce(t.timer_running, false) and t.timer_device = p_device and p_backfill > 0 then
    credit := credit + least(p_backfill, 600);
  end if;
  if t.timer_segment_at is not null then
    real_elapsed := floor(extract(epoch from (now() - t.timer_segment_at)))::integer;
    credit := least(credit, greatest(real_elapsed, 0));
  end if;

  update public.tasks set
    active_seconds = coalesce(t.active_seconds, 0) + greatest(credit, 0),
    timer_running = true,
    timer_segment_at = now(),
    timer_heartbeat_at = now(),
    timer_device = p_device,
    timer_device_kind = p_kind
  where id = p_task returning * into t;
  return t;
end $$;

/**
 * L'appareil s'en va : téléphone qu'on quitte, fenêtre qu'on ferme, onglet
 * qu'on referme. Le segment est crédité jusqu'à maintenant, puis fermé.
 * Un autre appareil encore présent le relancera de lui-même dans la seconde.
 */
create or replace function timer_release(p_task uuid, p_device text)
returns public.tasks language plpgsql security invoker as $$
declare t public.tasks; v_dev text; v_kind text;
begin
  delete from public.task_presence where task_id = p_task and device_id = p_device;

  select * into t from public.tasks where id = p_task for update;
  if not found then return null; end if;
  if not coalesce(t.timer_running, false) then return t; end if;

  -- Un devoir qui se fait hors de l'app ne s'arrête pas quand on quitte l'app.
  if coalesce(t.work_on_phone, false) then
    update public.tasks set timer_heartbeat_at = now() where id = p_task returning * into t;
    return t;
  end if;

  -- Quelqu'un d'autre est encore là ? Alors il ne se passe rien : le chrono
  -- continue sur l'autre appareil, sans coupure ni reprise. On lui passe
  -- simplement l'étiquette, pour que le parent voie le bon appareil.
  select device_id, kind into v_dev, v_kind from public.task_presence
   where task_id = p_task
     and last_seen_at > now() - make_interval(secs => timer_stale_seconds())
   order by last_seen_at desc limit 1;
  if v_dev is not null then
    update public.tasks set
      timer_heartbeat_at = now(), timer_device = v_dev, timer_device_kind = coalesce(v_kind, t.timer_device_kind)
    where id = p_task returning * into t;
    return t;
  end if;

  update public.tasks set
    active_seconds = coalesce(t.active_seconds, 0) + timer_segment_seconds(t, now()),
    timer_running = false,
    timer_segment_at = null,
    timer_heartbeat_at = now()
  where id = p_task returning * into t;
  return t;
end $$;

/* ------------------------------------------------------ pause volontaire -- */

create or replace function timer_pause(p_task uuid)
returns public.tasks language plpgsql security invoker as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then return null; end if;

  update public.tasks set
    active_seconds = coalesce(t.active_seconds, 0) + timer_segment_seconds(t, now()),
    timer_running = false,
    timer_segment_at = null,
    timer_heartbeat_at = now(),
    timer_paused = true
  where id = p_task returning * into t;
  return t;
end $$;

create or replace function timer_resume(p_task uuid, p_device text, p_kind text)
returns public.tasks language plpgsql security invoker as $$
declare t public.tasks;
begin
  update public.tasks set timer_paused = false where id = p_task;
  -- Affectation directe : `select f() into t` fourrerait la ligne entière dans
  -- le premier champ de `t`.
  t := timer_touch(p_task, p_device, p_kind, 0);
  return t;
end $$;

/** Fermeture définitive, avant validation d'une tâche. */
create or replace function timer_finalize(p_task uuid)
returns public.tasks language plpgsql security invoker as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then return null; end if;

  delete from public.task_presence where task_id = p_task;

  update public.tasks set
    active_seconds = coalesce(t.active_seconds, 0) + timer_segment_seconds(t, now()),
    timer_running = false,
    timer_segment_at = null,
    timer_paused = false
  where id = p_task returning * into t;
  return t;
end $$;

/* ------------------------------------------------------------- ménage ---- */

/**
 * Referme les segments abandonnés. Appelé chaque minute par `/api/cron/tick`,
 * pour que le tableau de bord du parent reste juste même si plus aucun
 * appareil n'est allumé.
 */
create or replace function timer_sweep() returns integer
language plpgsql security definer set search_path = public as $$
declare t public.tasks; n integer := 0;
begin
  delete from public.task_presence
   where last_seen_at < now() - make_interval(secs => timer_stale_seconds() * 4);

  for t in
    select * from public.tasks
    where status = 'doing' and coalesce(timer_running, false)
  loop
    -- Segment orphelin (l'appareil ne bat plus) : on fige au dernier battement.
    if not timer_is_live(t) then
      update public.tasks set
        active_seconds = coalesce(t.active_seconds, 0) + timer_segment_seconds(t),
        timer_running = false, timer_segment_at = null
      where id = t.id;
      n := n + 1;

    -- Tâche « hors de l'app » lancée depuis trop longtemps : on referme au
    -- plafond plutôt que de la laisser courir indéfiniment.
    elsif coalesce(t.work_on_phone, false)
      and t.timer_segment_at < now() - make_interval(secs => greatest(10800, coalesce(t.duration_min, 45) * 120)) then
      update public.tasks set
        active_seconds = coalesce(t.active_seconds, 0) + timer_segment_seconds(t),
        timer_running = false, timer_segment_at = null
      where id = t.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

grant execute on function server_now() to authenticated, anon;
grant execute on function timer_start(uuid, text, text) to authenticated;
grant execute on function timer_touch(uuid, text, text, integer) to authenticated;
grant execute on function timer_release(uuid, text) to authenticated;
grant execute on function timer_pause(uuid) to authenticated;
grant execute on function timer_resume(uuid, text, text) to authenticated;
grant execute on function timer_finalize(uuid) to authenticated;
grant execute on function timer_sweep() to service_role;
grant select, insert, update, delete on table task_presence to authenticated;

notify pgrst, 'reload schema';
