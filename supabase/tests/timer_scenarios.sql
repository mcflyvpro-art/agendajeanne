\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Outils de scénario -------------------------------------------------------
create or replace function t_reset() returns uuid language plpgsql as $$
declare v uuid;
begin
  delete from task_presence; delete from tasks;
  insert into tasks (child_id, title, status, duration_min)
  values ('11111111-1111-1111-1111-111111111111','Fractions','todo',45)
  returning id into v;
  return v;
end $$;

-- Recule le temps : simule N secondes écoulées depuis le début du segment.
create or replace function t_rewind(p uuid, seg_s int, beat_s int) returns void language sql as $$
  update tasks set timer_segment_at = now() - make_interval(secs => seg_s),
                   timer_heartbeat_at = now() - make_interval(secs => beat_s)
   where id = p;
  update task_presence set last_seen_at = now() - make_interval(secs => beat_s) where task_id = p;
$$;

create or replace function t_row(p uuid) returns tasks language sql as $$ select * from tasks where id = p $$;

do $$
declare id uuid; t tasks; n int;
begin
  ---------------------------------------------------------------- 1. départ
  id := t_reset();
  t := timer_start(id, 'pc-1', 'desktop');
  assert t.status = 'doing' and t.timer_running and t.timer_device = 'pc-1', 'départ';
  assert (select count(*) from task_presence where task_id = id) = 1, 'présence du PC';
  raise notice '1. départ sur le PC ..................... ok';

  ------------------------------------------- 2. PC en arrière-plan, 90 s
  perform t_rewind(id, 90, 40);            -- dernier battement il y a 40 s
  t := t_row(id);
  assert timer_is_live(t), 'segment vivant';
  assert timer_segment_seconds(t) between 88 and 92, 'segment ≈ 90 s (crédit jusqu''au battement + 60 s)';
  t := timer_touch(id, 'pc-1', 'desktop');
  assert t.active_seconds = 0 and t.timer_running, 'battement : rien n''est refermé';
  raise notice '2. arrière-plan sur le PC, le temps court  ok';

  --------------------------------- 3. le téléphone s'ouvre aussi (2e écran)
  perform t_rewind(id, 120, 5);
  t := timer_touch(id, 'tel-1', 'mobile');
  assert t.timer_device = 'pc-1', 'le PC garde la main tant qu''il est présent';
  assert (select count(*) from task_presence where task_id = id) = 2, 'deux appareils présents';
  assert t.active_seconds = 0, 'pas de double comptage';
  raise notice '3. téléphone en 2e écran, un seul compteur ok';

  ------------------------------------ 4. le téléphone part : rien ne bouge
  t := timer_release(id, 'tel-1');
  assert t.timer_running, 'le chrono continue : le PC est encore là';
  assert t.timer_device = 'pc-1', 'toujours le PC';
  raise notice '4. le téléphone s''en va, le PC continue .. ok';

  --------------------------------------------- 5. la fenêtre du PC se ferme
  perform t_rewind(id, 300, 2);
  t := timer_release(id, 'pc-1');
  assert not t.timer_running, 'plus personne : le chrono s''arrête';
  assert t.active_seconds between 298 and 302, format('crédit ≈ 300 s (obtenu %s)', t.active_seconds);
  assert (select count(*) from task_presence where task_id = id) = 0, 'plus aucune présence';
  raise notice '5. fermeture du PC → arrêt net ........... ok';

  ------------------------------------- 6. elle rouvre l'app sur le téléphone
  t := timer_touch(id, 'tel-1', 'mobile');
  assert t.timer_running and t.timer_device = 'tel-1', 'reprise automatique sur le téléphone';
  assert t.active_seconds between 298 and 302, 'le total est conservé';
  raise notice '6. retour sur le téléphone → reprise ..... ok';
end $$;

-- 7. Appareil qui ne répond plus (plantage, coupure de courant) -------------
do $$
declare id uuid; t tasks; n int;
begin
  id := t_reset();
  t := timer_start(id, 'pc-1', 'desktop');
  perform t_rewind(id, 8 * 3600, 8 * 3600 - 120);   -- éteint il y a ~8 h, après 2 min de travail
  t := t_row(id);
  assert not timer_is_live(t), 'segment orphelin';
  assert timer_segment_seconds(t) between 178 and 182,
    format('tronqué au dernier battement + 60 s, pas 8 h (obtenu %s)', timer_segment_seconds(t));
  n := timer_sweep();
  t := t_row(id);
  assert n = 1 and not t.timer_running, 'le ménage referme le segment';
  assert t.active_seconds between 178 and 182, format('crédit ≈ 180 s (obtenu %s)', t.active_seconds);
  raise notice '7. PC éteint 8 h → 3 min créditées ....... ok';
end $$;

-- 8. Pause volontaire --------------------------------------------------------
do $$
declare id uuid; t tasks;
begin
  id := t_reset();
  t := timer_start(id, 'pc-1', 'desktop');
  perform t_rewind(id, 60, 1);
  t := timer_pause(id);
  assert not t.timer_running and t.timer_paused and t.active_seconds between 58 and 62, 'pause';
  t := timer_touch(id, 'pc-1', 'desktop');
  assert not t.timer_running, 'un appareil présent ne relance pas une pause volontaire';
  t := timer_touch(id, 'tel-1', 'mobile');
  assert not t.timer_running, 'un autre appareil non plus';
  t := timer_resume(id, 'tel-1', 'mobile');
  assert t.timer_running and not t.timer_paused and t.timer_device = 'tel-1', 'reprise volontaire';
  raise notice '8. pause volontaire respectée ............ ok';
end $$;

-- 9. Tâche « travail sur téléphone » -----------------------------------------
do $$
declare id uuid; t tasks; n int;
begin
  id := t_reset();
  update tasks set work_on_phone = true;
  t := timer_start(id, 'tel-1', 'mobile');
  perform t_rewind(id, 600, 600);          -- app quittée depuis 10 min
  t := t_row(id);
  assert timer_is_live(t), 'hors de l''app : le chrono reste vivant';
  assert timer_segment_seconds(t) between 598 and 602, 'temps réel compté';
  t := timer_release(id, 'tel-1');
  assert t.timer_running, 'quitter l''app n''arrête pas ce type de tâche';
  n := timer_sweep();
  assert n = 0, 'rien à refermer tant qu''on est sous le plafond';

  perform t_rewind(id, 20 * 3600, 20 * 3600);
  n := timer_sweep();
  t := t_row(id);
  assert n = 1 and not t.timer_running, 'le plafond finit par refermer';
  assert t.active_seconds = 10800, format('plafonné à 3 h (obtenu %s)', t.active_seconds);
  raise notice '9. travail hors de l''app + plafond ....... ok';
end $$;

-- 10. Rattrapage après coupure réseau / onglet gelé ---------------------------
do $$
declare id uuid; t tasks;
begin
  id := t_reset();
  t := timer_start(id, 'pc-1', 'desktop');
  perform t_rewind(id, 400, 400);          -- 400 s sans nouvelle, mais elle était là
  t := timer_touch(id, 'pc-1', 'desktop', 400);
  assert t.active_seconds between 398 and 402,
    format('les 400 s de présence hors ligne sont rendues (obtenu %s)', t.active_seconds);

  -- Le segment encore vivant ne crédite rien : les secondes en cours restent
  -- dans le segment ouvert, elles ne sont pas comptées deux fois.
  perform t_rewind(id, 30, 30);
  t := timer_touch(id, 'pc-1', 'desktop', 600);
  assert t.active_seconds between 398 and 402,
    format('segment vivant : aucun crédit anticipé (obtenu %s)', t.active_seconds);

  -- Et on ne peut pas réclamer plus que le temps réellement écoulé : 300 s de
  -- silence, 600 s réclamées, 300 s accordées.
  perform t_rewind(id, 300, 300);
  t := timer_touch(id, 'pc-1', 'desktop', 600);
  assert t.active_seconds between 698 and 702,
    format('rattrapage borné par le temps réel (obtenu %s)', t.active_seconds);
  raise notice '10. rattrapage borné, jamais inventé ..... ok';
end $$;

-- 11. Deux appareils qui reprennent en même temps -----------------------------
do $$
declare id uuid; t tasks;
begin
  id := t_reset();
  t := timer_start(id, 'pc-1', 'desktop');
  perform t_rewind(id, 300, 300);          -- segment orphelin
  t := timer_touch(id, 'pc-1', 'desktop'); -- le PC reprend
  t := timer_touch(id, 'tel-1', 'mobile'); -- le téléphone arrive juste après
  assert t.timer_device = 'pc-1', 'le second ne vole pas la main';
  -- 60 s créditées : le segment est tronqué au dernier battement (+ la grâce),
  -- pas aux 300 s de silence. Et le second appareil ne recrédite rien.
  assert t.active_seconds between 58 and 62,
    format('un seul crédit, pas deux (obtenu %s)', t.active_seconds);
  raise notice '11. reprise simultanée, un seul crédit ... ok';
end $$;

-- 12. Validation de la tâche --------------------------------------------------
do $$
declare id uuid; t tasks;
begin
  id := t_reset();
  t := timer_start(id, 'pc-1', 'desktop');
  perform t_rewind(id, 120, 1);
  t := timer_finalize(id);
  assert not t.timer_running and t.active_seconds between 118 and 122, 'total figé';
  assert (select count(*) from task_presence where task_id = id) = 0, 'présences purgées';
  raise notice '12. validation : total figé .............. ok';
end $$;
