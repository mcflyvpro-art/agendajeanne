# 📓 Agenda Jeanne

Une PWA qui recrée un cadre de journée complet pour une élève de 3e au CNED —
et un système de motivation entièrement paramétrable par le parent.

Une seule application, deux interfaces, quatre appareils :

| Qui | Appareils | Ce qu'il ou elle voit |
|---|---|---|
| Parent | iPhone + **Mac** | tableau de bord, agenda, économie, règles |
| Jeanne | iPhone + **PC Windows** | écran « Maintenant », minuteur focus, boutique, quiz |

C'est le compte qui décide de l'interface, pas l'appareil : chacun peut se
connecter sur son téléphone **et** sur son ordinateur, et tout reste synchronisé
en direct dans les deux sens.

Next.js 15 · Supabase · Web Push (VAPID) · déploiement Vercel.

---

## Mise en route

### 1. Base de données

Dans **Supabase → SQL Editor**, colle et exécute `supabase/schema.sql`, puis les
migrations `v2.sql` … `v9.sql` dans l'ordre, et enfin `realtime.sql`.

> `v7.sql` ajoute le réglage « travail sur téléphone » et la table
> `push_devices` (un appareil = un abonnement), puis publie toutes les tables en
> temps réel. `v8.sql` installe l'horloge de présence décrite plus bas : la
> table `task_presence` et les fonctions du chronomètre. `v9.sql` ajoute le
> rôle `admin` (compte observateur, lecture seule). Tous sont idempotents et
> ne suppriment rien.
Le script est idempotent : tables, RLS, badges, matières, récompenses de départ
et buckets de stockage. Les profils des comptes `jeanne@` et `virginie@` sont créés au passage.

### 2. Variables d'environnement

Copie `.env.example` vers `.env.local` et remplis :

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client navigateur |
| `SUPABASE_SERVICE_ROLE_KEY` | routes serveur uniquement — **jamais** dans le repo |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (`npm run vapid`) |
| `CRON_SECRET` | protège `/api/cron/tick` |
| `ANTHROPIC_API_KEY` | quiz depuis photo (repli : `GROQ_API_KEY`) |

### 3. Local

```bash
npm install
npm run dev
```

### 4. Déploiement

Importe le repo sur Vercel, recopie **toutes** les variables ci-dessus dans
*Settings → Environment Variables*, puis déploie.

### 5. Moteur de rappels

Après le déploiement : ouvre `supabase/cron.sql`, remplace `app_url` et
`cron_secret` par tes valeurs, exécute-le dans le SQL Editor.
`pg_cron` appellera `/api/cron/tick` **chaque minute** — c'est lui qui envoie
les rappels, escalade vers le parent et génère les tâches récurrentes.

### 6. Sur les iPhones

Ouvre l'URL dans **Safari** → *Partager* → **« Sur l'écran d'accueil »**, puis
lance l'app **depuis l'icône** et autorise les notifications.

> Sur iOS, le Web Push ne fonctionne **que** pour une PWA installée sur l'écran
> d'accueil. Ouverte dans Safari, aucun rappel n'arrivera. L'app détecte ce cas
> et prévient le parent quand l'enfant n'est plus joignable.

### 7. Sur le Mac et sur le PC

L'app s'installe aussi en logiciel de bureau, avec sa fenêtre, son icône dans le
Dock ou la barre des tâches, et ses notifications.

- **Safari (macOS Sonoma et plus)** : *Fichier → Ajouter au Dock*, puis lancer
  depuis le Dock — c'est aussi ce qui autorise les rappels.
- **Chrome / Edge (Mac et Windows)** : icône d'installation dans la barre
  d'adresse, ou le bouton **« Installer l'app »** proposé par l'app elle-même.

Deux applications distinctes sont proposées selon l'interface ouverte au moment
de l'installation : **Agenda — Parent** (s'ouvre sur le tableau de bord) et
**Agenda — Jeanne** (s'ouvre sur « Aujourd'hui »).

Dans une fenêtre d'ordinateur, l'app prend la forme attendue d'un logiciel :
navigation en colonne à gauche, contenu plus large, raccourcis clavier
⌘1…⌘5 (Ctrl sous Windows), Échap pour fermer une fenêtre, feuilles modales
centrées, état de la synchronisation toujours visible. **Aucune fonction n'est
retirée** : c'est la même application, présentée autrement.

---

## Synchronisation

Un seul canal temps réel pour toute l'app (`src/lib/sync.ts`) :

- reconnexion automatique avec temporisation croissante, et relecture complète
  de l'écran dès que la liaison revient ;
- relecture au retour au premier plan, au réveil de l'appareil et au retour du
  réseau — le jeton de session est rafraîchi avant les requêtes ;
- filet de sécurité : une relecture par minute tant que la fenêtre est visible,
  au cas où un évènement se serait perdu ;
- propagation immédiate entre les fenêtres d'un même appareil ;
- présence : chacun voit d'où l'autre est connecté.

Les notifications partent sur **tous** les appareils d'une personne (table
`push_devices`) : avant, se connecter sur un deuxième appareil effaçait
l'abonnement du premier.

## Le compte observateur

Un troisième rôle, `admin`, pensé pour toi : un compte qui se connecte, ne se
déconnecte jamais tout seul, et affiche en un coup d'œil ce qui se passe côté
parent **et** côté enfant — sans jamais pouvoir rien changer. Pas besoin de te
connecter avec leurs comptes pour observer.

### Créer le compte

1. Dans **Supabase → Authentication → Add user**, crée un compte avec
   n'importe quel e-mail et mot de passe (c'est celui-là que tu utiliseras sur
   `/login`).
2. Dans **SQL Editor**, exécute :
   ```sql
   select create_observer_account('ton-email@example.com');
   ```
   La fonction vient de `v9.sql` ; rejouer ne fait rien si le compte existe déjà.
3. Connecte-toi sur `/login` avec cet e-mail : tu arrives directement sur
   `/admin`.

### Ce que la page affiche

- **Connectés maintenant** — quels appareils sont ouverts côté parent et côté
  enfant, en direct.
- **En ce moment** — la tâche en cours de l'enfant, son chronomètre, si le
  travail continue ou s'est arrêté, et sur quel type d'appareil.
- **Journée** — les tâches du jour et leur état.
- **Économie** — solde, XP, série, niveau.
- **Fil d'activité** — messages, mouvements du solde, demandes de récompense,
  humeurs partagées, le tout mêlé et attribué à la bonne personne.

### Pourquoi il ne peut rien casser

Ce n'est pas qu'une discipline d'écriture de la page : la base de données
l'impose. Toute politique d'écriture (`p_parent_all`) est conditionnée à
`is_parent()`, qui ne vaut que pour le rôle `parent` — jamais pour `admin`.
Même une page mal écrite ne pourrait rien modifier ; le compte observateur
n'a que le droit de lecture ouvert à tout compte connecté.

Il se rend aussi invisible : contrairement au parent et à l'enfant, il ne
s'annonce pas dans la présence en temps réel — le parent et l'enfant ne
voient jamais qu'un observateur regarde.

### Une limite honnête

« Ne jamais être déconnecté » dépend aussi des réglages de Supabase Auth
(durée de vie du jeton de rafraîchissement). Le code ne ferme jamais la
session de lui-même — contrairement au compte parent, dont l'inactivité
prolongée coupe la session — mais si Supabase révoque les jetons inactifs
depuis longtemps, une reconnexion occasionnelle reste possible. Ouvrir l'app
de temps en temps suffit à l'éviter.

## Le chronomètre : une horloge de présence

C'est la pièce la plus délicate de l'app, alors la règle est unique et
explicite :

> **Le temps s'accumule tant qu'au moins un appareil est présent.
> Il s'arrête dès qu'il n'y en a plus.**

« Présent » ne veut pas dire la même chose partout, et c'est voulu :

| Appareil | Présent tant que… |
|---|---|
| Ordinateur (Mac, PC) | l'app est **ouverte**, même en arrière-plan, même minimisée |
| Téléphone | l'app est **affichée à l'écran** |
| Tâche « 📱 travail sur téléphone » | toujours — le devoir se fait justement hors de l'app |

Chaque appareil présent laisse une ligne dans `task_presence` et bat toutes les
quinze secondes. Ce battement est la seule preuve de présence : s'il cesse —
fenêtre fermée, ordinateur éteint, coupure de courant — le segment en cours est
refermé **rétroactivement au dernier battement**. Aucune heure fantôme ne peut
donc être créditée, même si personne ne revient jamais.

### Ce que ça donne, situation par situation

| Ce qu'elle fait | Ce qui se passe |
|---|---|
| Elle lance la tâche sur le PC | le chrono démarre |
| Elle passe sur une autre fenêtre, l'app reste ouverte | **le temps continue** |
| Elle change d'écran dans l'app (Boutique, Quiz) | le temps continue |
| Elle ferme la fenêtre ou quitte l'app | le temps **s'arrête**, à la seconde |
| Elle rouvre l'app — sur le PC ou sur le téléphone | le temps **repart tout seul**, total conservé |
| Les deux appareils sont ouverts | un seul compteur, jamais le double |
| Le téléphone s'en va, le PC reste ouvert | rien ne s'arrête, même pas une seconde |
| Le PC s'éteint, le téléphone est ouvert | le téléphone reprend la main aussitôt |
| Elle range son téléphone (tâche normale) | le temps s'arrête |
| Elle quitte l'app (tâche « travail sur téléphone ») | le temps continue |
| Elle appuie sur Pause | le temps s'arrête, et **aucun** appareil ne le relance tout seul |
| L'ordinateur plante, ou le courant saute | le temps est figé au dernier battement (≤ 1 min de marge) |
| Le réseau tombe pendant qu'elle travaille | les secondes sont rendues au retour, dans la limite du temps réellement écoulé |
| Une tâche reste ouverte toute la nuit | plafonnée à 3 h (ou deux fois la durée prévue) |

### Pourquoi c'est fiable

- **Une seule horloge.** Toutes les transitions passent par des fonctions SQL
  qui n'utilisent que `now()` côté serveur. Une pendule d'ordinateur mal réglée
  ne fausse plus rien ; l'affichage se cale sur cette même horloge.
- **Pas de course entre appareils.** Chaque transition prend un verrou sur la
  ligne : deux appareils qui reprennent la main au même instant ne créditent
  jamais deux fois.
- **Le départ est annoncé.** À la fermeture de la fenêtre, une requête
  `keepalive` part malgré la page qui meurt. Si elle n'arrive pas, le battement
  de cœur fait le ménage.
- **Le ménage tourne sans personne.** `/api/cron/tick` referme chaque minute les
  segments abandonnés : le tableau de bord du parent reste juste même si plus
  aucun appareil n'est allumé.
- **Rien ne s'invente.** Le rattrapage après coupure est borné par le temps
  réellement écoulé depuis le début du segment.

Ces scénarios se rejouent en quelques secondes sur un PostgreSQL local :
voir `supabase/tests/`.

### Le réglage « travail sur téléphone »

Il se coche à la création de la tâche (*Agenda → la tâche → onglet Règles*) et
sert aux devoirs qui se font hors de l'agenda : manuel numérique, vidéo,
application. Sans lui, l'enfant sort de l'app pour travailler, le temps ne
compte plus, et le bouton « J'ai fini » ne se débloque jamais — elle reste
bloquée. Un bouton **Pause** explicite reste toujours à sa disposition.

Le type d'appareil est reconnu automatiquement, et reste modifiable à la main
dans **Moi → Cet appareil** (côté parent : *Réglages → Objectif*).

---

## Architecture

```
src/
  app/
    now|day|quiz|shop|me/        interface enfant
    parent/{,agenda,rewards,stats,rules}   interface parent
    api/
      cron/tick        moteur : rappels, escalade, routines, tâches manquées
      notify           push ponctuel (kudos, blocage, demande de récompense)
      ai/quiz          photo de leçon → 10 QCM
      ai/split         tâche floue → micro-étapes
      routines/generate
  components/
    NavShell.tsx  onglets en bas sur téléphone, colonne à gauche sur ordinateur
  lib/
    sync.ts      canal temps réel unique, reconnexion, présence
    timer.ts     chronomètre : mêmes calculs que les fonctions SQL
    clock.ts     horloge du serveur, pour ne dépendre d'aucune pendule locale
    device.ts    téléphone ou ordinateur — décide de la pause du minuteur
    useTimer.ts     affichage du chronomètre
    useTimerAgent.ts présence de l'appareil : battement, départ, reprise
    economy.ts   barème, bonus, niveaux, série, badges
    tone.ts      rédaction des notifications (4 tons × 8 moments)
    actions.ts   démarrage, validation, crédit, journée parfaite
    ai.ts        Anthropic prioritaire, Groq en repli
```

## Ce que la techno ne peut pas faire

Une PWA ne peut pas bloquer l'iPhone ni couper TikTok. Pour ça, **Temps d'écran**
d'Apple avec un code que seul le parent connaît reste indispensable — l'app dit
quand débloquer, iOS applique.
