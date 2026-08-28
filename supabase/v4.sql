-- ============================================================================
--  AGENDA JEANNE — v4
--  À exécuter après v3. Idempotent, ne supprime aucune donnée.
-- ============================================================================

-- ------------------------------------------------------------- 1. MATIÈRES
-- Jeanne fait italien et arts plastiques, pas de techno ni d'espagnol.
-- On renomme plutôt que de supprimer, pour ne pas casser les tâches existantes.
update subjects set name = 'Arts plastiques', emoji = '🎨', color = '#F472B6' where name = 'Techno';
update subjects set name = 'Italien',         emoji = '🇮🇹', color = '#22C55E' where name = 'Espagnol';

insert into subjects (name, emoji, color, position)
select 'Italien', '🇮🇹', '#22C55E', 7
where not exists (select 1 from subjects where name = 'Italien');

insert into subjects (name, emoji, color, position)
select 'Arts plastiques', '🎨', '#F472B6', 8
where not exists (select 1 from subjects where name = 'Arts plastiques');

-- --------------------------------------------- 2. AVATARS GAGNÉS AU NIVEAU
-- Un avatar avec `unlock_level` n'est pas à vendre : il s'obtient en montant
-- de niveau, et s'affiche sur la route des niveaux.
alter table rewards add column if not exists unlock_level integer;

-- Ceux-là quittent la boutique et deviennent des récompenses de palier.
update rewards set unlock_level = 3,  cost = 0 where kind = 'item' and item_value = '🌸';
update rewards set unlock_level = 5,  cost = 0 where kind = 'item' and item_value = '🦋';
update rewards set unlock_level = 8,  cost = 0 where kind = 'item' and item_value = '🦉';
update rewards set unlock_level = 12, cost = 0 where kind = 'item' and item_value = '🦄';
update rewards set unlock_level = 16, cost = 0 where kind = 'item' and item_value = '🐉';
update rewards set unlock_level = 20, cost = 0 where kind = 'item' and item_value = '🌟';
update rewards set unlock_level = 25, cost = 0 where kind = 'item' and item_value = '👑';

-- ------------------------------------- 3. RÉGLAGE DE CALIBRAGE DE L'ÉCONOMIE
-- Mémorise ce que le parent a saisi dans le formulaire, pour le réafficher.
alter table settings add column if not exists calib_tasks_per_day integer not null default 4;
alter table settings add column if not exists calib_weekly_target integer not null default 1200;

notify pgrst, 'reload schema';
