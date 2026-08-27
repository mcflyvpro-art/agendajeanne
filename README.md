# 📓 Agenda Jeanne

Une PWA qui recrée un cadre de journée complet pour une élève de 3e au CNED —
et un système de motivation entièrement paramétrable par le parent.

- **iPhone 15 (parent)** → tableau de bord, agenda, économie, règles
- **iPhone 12 (Jeanne)** → écran « Maintenant », minuteur focus, boutique, quiz

Next.js 15 · Supabase · Web Push (VAPID) · déploiement Vercel.

---

## Mise en route

### 1. Base de données

Dans **Supabase → SQL Editor**, colle et exécute `supabase/schema.sql`.
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

### 6. Sur les deux iPhones

Ouvre l'URL dans **Safari** → *Partager* → **« Sur l'écran d'accueil »**, puis
lance l'app **depuis l'icône** et autorise les notifications.

> Sur iOS, le Web Push ne fonctionne **que** pour une PWA installée sur l'écran
> d'accueil. Ouverte dans Safari, aucun rappel n'arrivera. L'app détecte ce cas
> et prévient le parent quand l'enfant n'est plus joignable.

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
  lib/
    economy.ts   barème, bonus, niveaux, série, badges
    tone.ts      rédaction des notifications (4 tons × 8 moments)
    actions.ts   démarrage, validation, crédit, journée parfaite
    ai.ts        Anthropic prioritaire, Groq en repli
```

## Ce que la techno ne peut pas faire

Une PWA ne peut pas bloquer l'iPhone ni couper TikTok. Pour ça, **Temps d'écran**
d'Apple avec un code que seul le parent connaît reste indispensable — l'app dit
quand débloquer, iOS applique.
