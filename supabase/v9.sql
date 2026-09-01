-- ============================================================================
--  AGENDA JEANNE — v9. À exécuter après v8. Idempotent, ne supprime rien.
--
--  COMPTE OBSERVATEUR (« admin »).
--
--  Un troisième rôle, pour toi seul : il se connecte, ne se déconnecte jamais
--  tout seul, et voit tout ce qui se passe côté parent et côté enfant — sans
--  jamais pouvoir rien changer. Ce n'est pas une promesse dans le code, c'est
--  une garantie de la base : la politique d'écriture des tables reste
--  réservée à `is_parent()`, qui ne vaut que pour le rôle `parent`. Un compte
--  `admin` n'y correspond jamais, quoi que fasse l'interface.
-- ============================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('parent','child','admin'));

/**
 * Crée le compte observateur à partir d'un utilisateur d'authentification
 * déjà existant (créé depuis Supabase → Authentication → Add user, avec
 * n'importe quel e-mail et mot de passe). Idempotent : rejouer ne fait rien
 * si le profil existe déjà avec ce rôle.
 *
 * Usage : remplace l'e-mail puis exécute.
 *   select create_observer_account('toi@example.com');
 */
create or replace function create_observer_account(p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then
    raise exception 'Aucun compte avec l''e-mail % — crée-le d''abord dans Supabase → Authentication → Add user', p_email;
  end if;

  insert into profiles (id, role, display_name, avatar_emoji, color)
  values (v_id, 'admin', 'Observateur', '🔭', '#334155')
  on conflict (id) do update set role = 'admin';

  return v_id;
end $$;

-- Volontairement PAS de droit pour `authenticated` : cette fonction change le
-- rôle d'un compte, security definer, donc capable de contourner les
-- politiques. L'exposer aux utilisateurs de l'app permettrait à n'importe qui
-- de se donner (ou de donner à un autre compte) le rôle observateur. Elle ne
-- s'exécute que depuis Supabase → SQL Editor (rôle postgres) ou en service_role.
revoke all on function create_observer_account(text) from public, authenticated, anon;
grant execute on function create_observer_account(text) to service_role;

notify pgrst, 'reload schema';
