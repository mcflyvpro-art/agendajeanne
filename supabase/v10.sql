-- ============================================================================
--  AGENDA JEANNE — v10. À exécuter après v9. Idempotent, ne supprime rien.
--
--  Referme un angle mort du mode observateur : les policies de stockage
--  (`proofs`, `attachments`) autorisaient l'écriture à n'importe quel compte
--  authentifié, sans vérifier son rôle — contrairement à toutes les autres
--  tables, réservées à `is_parent()` ou au propriétaire de la ligne. Un
--  observateur qui déclenchait un vrai envoi de photo aurait donc pu
--  réellement téléverser un fichier, même si aucune tâche n'aurait changé.
--
--  Le stockage suit désormais la même règle que le reste : parent et enfant
--  peuvent écrire, un observateur jamais.
-- ============================================================================

create or replace function is_parent_or_child() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('parent','child'))
$$;

do $$
begin
  drop policy if exists "family write"  on storage.objects;
  drop policy if exists "family update" on storage.objects;
  drop policy if exists "family delete" on storage.objects;

  create policy "family write" on storage.objects for insert to authenticated
    with check (bucket_id in ('proofs','attachments') and is_parent_or_child());
  create policy "family update" on storage.objects for update to authenticated
    using (bucket_id in ('proofs','attachments') and is_parent_or_child());
  create policy "family delete" on storage.objects for delete to authenticated
    using (bucket_id in ('proofs','attachments') and is_parent_or_child());
end $$;

notify pgrst, 'reload schema';
