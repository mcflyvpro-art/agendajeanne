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
migrations `v2.sql` … `v7.sql` dans l'ordre, et enfin `realtime.sql`.

> `v7.sql` ajoute le réglage « travail sur téléphone », le propriétaire du
> minuteur, la table `push_devices` (un appareil = un abonnement) et publie
> toutes les tables en temps réel. Il est idempotent et ne supprime rien.
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

## Le minuteur, et quand il se met en pause

C'est le point le plus subtil de l'app, alors il est explicite :

| Situation | Sortir de l'app |
|---|---|
| Téléphone, tâche normale | met le chrono **en pause** |
| Ordinateur (Mac ou PC) | **ne met pas** en pause — changer de fenêtre fait partie du travail |
| Tâche « 📱 travail sur téléphone » | **ne met pas** en pause, quel que soit l'appareil |

Le réglage **« Travail sur téléphone »** se coche à la création de la tâche
(*Agenda → la tâche → onglet Règles*). Il est fait pour les devoirs qui se font
justement hors de l'agenda : manuel numérique, vidéo, application. Sans lui,
l'enfant sort pour travailler, le temps ne compte plus, et le bouton
« J'ai fini » ne se débloque jamais — elle reste bloquée.

Quand la pause automatique ne s'applique pas, un bouton **Pause** explicite
apparaît : s'arrêter reste possible, mais c'est un choix, plus un effet de bord.

Deux garde-fous : le minuteur appartient à l'appareil qui l'a lancé (le
téléphone resté ouvert en poche ne met plus en pause le travail commencé sur le
PC), et un segment laissé ouvert cesse de compter au-delà de trois heures.

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
    device.ts    téléphone ou ordinateur — décide de la pause du minuteur
    useTimer.ts  chronomètre horodaté, règles de pause
    economy.ts   barème, bonus, niveaux, série, badges
    tone.ts      rédaction des notifications (4 tons × 8 moments)
    actions.ts   démarrage, validation, crédit, journée parfaite
    ai.ts        Anthropic prioritaire, Groq en repli
```

## Ce que la techno ne peut pas faire

Une PWA ne peut pas bloquer l'iPhone ni couper TikTok. Pour ça, **Temps d'écran**
d'Apple avec un code que seul le parent connaît reste indispensable — l'app dit
quand débloquer, iOS applique.
