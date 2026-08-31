# Vérifier le chronomètre

Le chronomètre est la pièce la plus délicate de l'app : il doit rester juste
quand deux appareils sont ouverts en même temps, quand l'un se ferme, quand
l'ordinateur s'éteint sans prévenir, et quand le réseau tombe. Ces scénarios se
rejouent en quelques secondes sur un PostgreSQL quelconque — inutile de toucher
à la base de production.

```bash
initdb -D /tmp/pg -A trust -U postgres
pg_ctl -D /tmp/pg -o "-p 5433" -l /tmp/pg/log start
psql -p 5433 -U postgres -c "create role authenticated; create role anon; create role service_role;"

psql -p 5433 -U postgres -f supabase/tests/timer_harness.sql   # tables minimales + auth.uid() simulé
psql -p 5433 -U postgres -f supabase/v8.sql                    # les fonctions à tester
psql -p 5433 -U postgres -f supabase/tests/timer_scenarios.sql # les scénarios
```

Chaque scénario s'annonce et s'arrête à la première anomalie :

```
1. départ sur le PC ..................... ok
2. arrière-plan sur le PC, le temps court  ok
3. téléphone en 2e écran, un seul compteur ok
4. le téléphone s'en va, le PC continue .. ok
5. fermeture du PC → arrêt net ........... ok
6. retour sur le téléphone → reprise ..... ok
7. PC éteint 8 h → 3 min créditées ....... ok
8. pause volontaire respectée ............ ok
9. travail hors de l'app + plafond ....... ok
10. rattrapage borné, jamais inventé ..... ok
11. reprise simultanée, un seul crédit ... ok
12. validation : total figé .............. ok
```

Le temps est simulé en reculant les horodatages (`t_rewind`) : les fonctions ne
lisent que `now()` et la ligne, il n'y a donc rien à attendre pour rejouer huit
heures d'absence.
