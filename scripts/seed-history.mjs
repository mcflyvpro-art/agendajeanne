/**
 * Jeu de données réaliste — simule ~3 mois d'utilisation intensive de l'app
 * par Jeanne, pour tester chaque écran en conditions réelles avant que la
 * famille ne s'en serve pour de vrai.
 *
 * Écrit directement dans la base Supabase du projet (clé de service, lue dans
 * .env.local). Purement additif : les tâches/routines/matières existantes ne
 * sont pas touchées, seul le profil de l'enfant et son historique sont
 * enrichis. Le bouton de remise à zéro (7 taps sur « Réglages ») efface tout
 * ça d'un coup.
 *
 * Lancement : node scripts/seed-history.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = loadEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- utilitaires
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[randi(0, arr.length - 1)];
const weighted = (pairs) => {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  let r = rand(0, total);
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[0][0];
};
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const ts = (iso, minutes) => new Date(`${iso}T00:00:00Z`).getTime() + minutes * 60000;
const isoTime = (iso, minutes) => new Date(ts(iso, minutes)).toISOString();
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/**
 * `onConflict` rend l'insertion idempotente : le script peut être relancé
 * (ou avoir été interrompu en cours de route) sans buter sur des lignes
 * déjà présentes — que ce soit un reste d'un essai précédent ou une vraie
 * donnée que la famille avait déjà (ex. un badge gagné en testant l'app).
 */
async function insertAll(table, rows, onConflict, batch = 250) {
  for (const c of chunks(rows, batch)) {
    if (!c.length) continue;
    const { error } = onConflict
      ? await db.from(table).upsert(c, { onConflict, ignoreDuplicates: true })
      : await db.from(table).insert(c);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ------------------------------------------------------------------ contenu
const VERBS = ['Exercices sur', 'Réviser', 'Fiche de révision :', 'Lire', 'Contrôle blanc :', 'Apprendre', 'Rédiger', 'S’entraîner sur'];
const TOPICS = {
  'Maths': ['les fractions', 'Thalès', 'Pythagore', 'les équations', 'les probabilités', 'la géométrie dans l’espace', 'les puissances', 'les fonctions'],
  'Français': ['le résumé de chapitre', 'la dictée', 'l’analyse du texte', 'les figures de style', 'la conjugaison', 'l’argumentation', 'le commentaire'],
  'Histoire-Géo': ['la Première Guerre mondiale', 'la Seconde Guerre mondiale', 'la décolonisation', 'les espaces urbains', 'la Ve République', 'les frontières'],
  'Anglais': ['le vocabulaire de l’unité 4', 'le prétérit', 'la compréhension orale', 'les verbes irréguliers', 'un dialogue', 'un texte'],
  'SVT': ['la reproduction', 'la génétique', 'le système nerveux', 'les risques naturels', 'l’évolution'],
  'Physique-Chimie': ['les atomes', 'les circuits électriques', 'la mécanique', 'les mélanges', 'l’énergie'],
  'Italien': ['le vocabulaire de la famille', 'les verbes au présent', 'un dialogue', 'la conjugaison'],
  'Arts plastiques': ['le carnet de croquis', 'la composition', 'un exposé sur un artiste', 'une œuvre en couleur'],
  'Brevet': ['un sujet blanc de maths', 'un sujet blanc de français', 'les annales d’histoire-géo', 'une fiche de révision générale'],
  'Perso': ['son classeur', 'son sac pour demain', 'sa présentation orale'],
};
const KUDOS = ['Bravo, continue comme ça 🔥', 'Fière de toi', 'Excellent travail aujourd’hui', 'Quelle efficacité !', 'Merci d’avoir tenu bon', 'Pile dans le mille 🎯', 'Tu progresses vraiment', 'Journée impeccable'];
const MAIL = ['On est fiers de tes efforts cette semaine.', 'N’oublie pas ton rendez-vous chez le dentiste jeudi.', 'Ce week-end on va au ciné si tu veux.', 'Bon courage pour le contrôle de demain !', 'On peut revoir ensemble le chapitre si tu veux.'];
const REACTIONS = ['thumb_up', 'heart', 'check', null, null];

async function main() {
  console.log('Chargement des données existantes…');
  const [{ data: profiles }, { data: settingsRow }, { data: subjects }, { data: badges }, { data: rewards }] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('settings').select('*').eq('id', 1).maybeSingle(),
    db.from('subjects').select('*').eq('active', true),
    db.from('badges').select('*'),
    db.from('rewards').select('*'),
  ]);
  const child = profiles.find((p) => p.role === 'child');
  const parent = profiles.find((p) => p.role === 'parent');
  const s = settingsRow;
  if (!child || !parent || !s) throw new Error('Profils ou réglages introuvables');
  console.log(`Enfant : ${child.display_name} (${child.id})`);

  const today = isoDay(new Date());
  const START = -90, END = 3;
  const days = [];
  for (let i = START; i <= END; i++) days.push(addDays(today, i));
  const pastDays = days.filter((d) => d < today);
  const futureDays = days.filter((d) => d >= today);

  const suggestCoins = (duration, diff) => {
    const mult = s.difficulty_mult?.[String(diff)] ?? 1;
    return Math.max(1, Math.round((s.base_coins + (s.coins_per_10min * duration) / 10) * mult));
  };
  const xpFor = (diff) => Math.max(1, Math.round(s.xp_per_task * (s.difficulty_mult?.[String(diff)] ?? 1)));

  // ------------------------------------------------------- état simulé
  let coins = 0, xp = 0;
  let streak = 0, bestStreak = 0, lastCompleteDay = null;
  let tasksTotal = 0, perfectDays = 0, bestQuizPct = 0, contractsAchieved = 0;
  const earned = new Set();

  const tasksToInsert = [];
  const ledger = [];
  const moods = [];
  const messages = [];
  const quizzes = [];
  const quizAttemptsBySlot = []; // { quizIndex, day, score, total }
  const earnedBadges = [];
  const redemptions = [];
  const contracts = [];

  const checkBadges = (day) => {
    for (const b of badges) {
      if (earned.has(b.code)) continue;
      const value = {
        streak, tasks_total: tasksTotal, perfect_days: perfectDays,
        quiz_score: bestQuizPct, early_bird: 0, contracts: contractsAchieved, level: levelOf(xp).level,
      }[b.rule_kind] ?? 0;
      if (value >= b.rule_value) {
        earned.add(b.code);
        earnedBadges.push({ child_id: child.id, code: b.code, earned_at: isoTime(day, 20 * 60) });
        if (b.coins_reward > 0) {
          coins += b.coins_reward;
          ledger.push({ child_id: child.id, amount: b.coins_reward, reason: `Badge : ${b.name}`, kind: 'bonus', created_at: isoTime(day, 20 * 60 + 5) });
        }
      }
    }
  };

  function levelOf(x) {
    const per = Math.max(1, s.xp_per_level);
    return { level: Math.floor(x / per) + 1, into: x % per };
  }

  const actionRewards = rewards.filter((r) => r.kind !== 'item');
  const itemRewards = rewards.filter((r) => r.kind === 'item');

  // ---------------------------------------------------------- routines (contexte)
  const routines = [
    { title: 'Maths — exercices du jour', subject: 'Maths', days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', duration_min: 45, difficulty: 2 },
    { title: 'Français — lecture', subject: 'Français', days_of_week: [1, 2, 3, 4, 5], start_time: '10:00', duration_min: 30, difficulty: 1 },
    { title: 'Anglais — vocabulaire', subject: 'Anglais', days_of_week: [1, 3, 5], start_time: '11:00', duration_min: 30, difficulty: 2 },
    { title: 'Histoire-Géo — chapitre', subject: 'Histoire-Géo', days_of_week: [2, 4], start_time: '14:00', duration_min: 45, difficulty: 2 },
  ].map((r) => ({ ...r, subject_id: subjects.find((sub) => sub.name === r.subject)?.id ?? null, subtasks: [], active: true }))
   .map(({ subject, ...r }) => r);

  // -------------------------------------------------------------- boucle jours
  let quizCounter = 0;
  const quizEveryDays = 6;
  let unreadLeft = 3; // laisse quelques messages non lus pour tester le badge en direct

  for (const day of pastDays) {
    const d = dow(day);
    const isWeekend = d === 0 || d === 6;
    const idxFromToday = Math.round((new Date(day) - new Date(today)) / 86400000); // négatif
    const monthsAgo = -idxFromToday / 30;
    // Tendance : elle s'améliore avec le temps (le but de l'app).
    let successRate = 0.5 + 0.32 * (1 - Math.min(1, monthsAgo / 3));
    // Un coup de mou simulé il y a environ deux mois (maladie / démotivation).
    if (idxFromToday >= -62 && idxFromToday <= -55) successRate -= 0.35;
    successRate = Math.max(0.1, Math.min(0.97, successRate));

    const nTasks = isWeekend ? randi(0, 2) : randi(3, 5);
    const daySubjects = isWeekend ? ['Perso', 'Brevet'] : Object.keys(TOPICS);
    let startMin = toMin(String(s.day_start).slice(0, 5)) + randi(-15, 30);
    const dayTasks = [];

    for (let i = 0; i < nTasks; i++) {
      const subjName = pick(daySubjects.filter((n) => TOPICS[n]));
      const subject = subjects.find((x) => x.name === subjName);
      const duration = weighted([[30, 3], [45, 4], [60, 2], [90, 1]]);
      const difficulty = weighted([[1, 2], [2, 4], [3, 3], [4, 1]]);
      const flexible = Math.random() < 0.2;
      const plannedStart = flexible ? null : fromMin(startMin);
      startMin += duration + randi(10, 40);

      const willDo = Math.random() < successRate;
      const coinsBase = suggestCoins(duration, difficulty);
      const title = `${pick(VERBS)} ${pick(TOPICS[subjName])}`;

      const task = {
        child_id: child.id, day, title, subject_id: subject?.id ?? null,
        start_time: plannedStart, duration_min: duration, is_flexible: flexible, difficulty,
        coins: coinsBase, allow_postpone: true, active_seconds: 0,
      };

      if (willDo) {
        const onTime = !flexible && Math.random() < 0.7;
        let pct = 0;
        if (onTime) pct += s.punctuality_bonus_pct;
        if (streak >= 3) pct += s.streak_bonus_pct;
        const awarded = Math.round(coinsBase * (1 + pct / 100));
        const xpAward = xpFor(difficulty);
        const activeSeconds = Math.round(duration * 60 * rand(0.65, 1.15));
        const startedMin = plannedStart ? toMin(plannedStart) + randi(-5, 15) : randi(startMin - duration - 20, startMin - duration);

        task.status = 'done';
        task.started_at = isoTime(day, Math.max(0, startedMin));
        task.completed_at = isoTime(day, Math.max(0, startedMin) + Math.round(activeSeconds / 60));
        task.validated_at = task.completed_at;
        task.active_seconds = activeSeconds;
        task.coins_awarded = awarded;
        task.xp_awarded = xpAward;

        coins += awarded; xp += xpAward; tasksTotal += 1;
        ledger.push({ child_id: child.id, amount: awarded, reason: `Tâche : ${title}`, kind: 'task', created_at: task.validated_at });
      } else {
        task.status = Math.random() < 0.5 ? 'missed' : 'skipped';
      }
      dayTasks.push(task);
    }

    // journée complète ?
    const real = dayTasks.filter((t) => t.status !== 'skipped');
    const complete = real.length > 0 && real.every((t) => t.status === 'done');
    if (complete) {
      perfectDays += 1;
      streak = lastCompleteDay === addDays(day, -1) ? streak + 1 : 1;
      bestStreak = Math.max(bestStreak, streak);
      lastCompleteDay = day;
      coins += s.perfect_day_bonus;
      ledger.push({ child_id: child.id, amount: s.perfect_day_bonus, reason: 'Journée parfaite 💎', kind: 'bonus', created_at: isoTime(day, 21 * 60) });
    } else if (real.length > 0) {
      streak = 0;
    }

    checkBadges(day);
    tasksToInsert.push(...dayTasks);

    // Humeur, la plupart des jours.
    if (Math.random() < 0.82) {
      const bad = idxFromToday >= -62 && idxFromToday <= -55;
      const code = bad ? pick(['sick', 'tired', 'bad', 'stressed']) : weighted([['great', 3], ['good', 4], ['ok', 3], ['meh', 1], ['bad', 1]]);
      const value = { great: 5, good: 4, ok: 3, meh: 2, bad: 1, tired: 2, sick: 1, stressed: 2, angry: 2 }[code];
      moods.push({ child_id: child.id, day, mood: value, code, created_at: isoTime(day, 8 * 60 + randi(0, 30)) });
    }

    // Messages, occasionnellement.
    if (Math.random() < 0.18) {
      const readAt = (unreadLeft > 0 && idxFromToday >= -2) ? null : isoTime(day, 19 * 60);
      if (readAt === null) unreadLeft -= 1;
      const kind = Math.random() < 0.6 ? 'kudos' : 'message';
      messages.push({
        from_id: parent.id, to_id: child.id, kind, emoji: kind === 'kudos' ? '💜' : '✉️',
        body: kind === 'kudos' ? pick(KUDOS) : pick(MAIL),
        reaction: readAt ? pick(REACTIONS) : null,
        read_at: readAt, created_at: isoTime(day, 19 * 60),
      });
    }
    if (Math.random() < 0.04) {
      messages.push({
        from_id: child.id, to_id: parent.id, kind: 'blocked', emoji: '🆘',
        body: 'Je comprends pas cet exercice, tu peux m’aider ?',
        read_at: isoTime(day, 18 * 60 + 30), created_at: isoTime(day, 17 * 60),
      });
    }

    // Quiz, tous les ~6 jours.
    quizCounter += 1;
    if (quizCounter >= quizEveryDays) {
      quizCounter = 0;
      const subjName = pick(Object.keys(TOPICS));
      const nQ = 10;
      const questions = Array.from({ length: nQ }, (_, i) => ({
        q: `Question ${i + 1} sur ${pick(TOPICS[subjName])} ?`,
        choices: ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
        answer: randi(0, 3),
        why: 'C’est la bonne réponse d’après le cours.',
      }));
      const fromParentQuiz = Math.random() < 0.25;
      const quizIndex = quizzes.length;
      quizzes.push({
        child_id: child.id, title: `${subjName} — ${pick(TOPICS[subjName])}`, subject: subjName,
        questions, source: fromParentQuiz ? 'parent' : 'child',
        assigned_by: fromParentQuiz ? parent.id : null, created_at: isoTime(day, 16 * 60),
      });
      const attempts = randi(1, 3);
      let base = randi(3, 6);
      for (let a = 0; a < attempts; a++) {
        const score = Math.min(nQ, base + a * randi(1, 2));
        // Les réponses doivent vraiment produire ce score, sinon la fiche de
        // révision du parent (bonne/mauvaise réponse par question) ne colle
        // plus au total affiché.
        const correctIdx = new Set();
        while (correctIdx.size < score) correctIdx.add(randi(0, nQ - 1));
        const answers = questions.map((q, i) =>
          correctIdx.has(i) ? q.answer : (q.answer + 1 + randi(0, 2)) % q.choices.length);
        quizAttemptsBySlot.push({ quizIndex, day: addDays(day, a), score, total: nQ, answers });
        bestQuizPct = Math.max(bestQuizPct, Math.round((score / nQ) * 100));
      }
      checkBadges(day);
    }
  }

  // --------------------------------------------------------------- redemptions
  const pastActionRewards = actionRewards.length ? actionRewards : [{ id: null, name: 'Récompense', emoji: '🎁', cost: 150 }];
  for (let i = 0; i < 5; i++) {
    const r = pick(pastActionRewards);
    const day = addDays(today, -randi(5, 80));
    const approved = Math.random() < 0.8;
    redemptions.push({
      reward_id: r.id, child_id: child.id, reward_name: r.name, reward_emoji: r.emoji, cost_paid: r.cost,
      status: approved ? 'approved' : 'refused', created_at: isoTime(day, 20 * 60), resolved_at: isoTime(day, 20 * 60 + 30),
    });
    if (approved) { coins -= r.cost; ledger.push({ child_id: child.id, amount: -r.cost, reason: r.name, kind: 'reward', created_at: isoTime(day, 20 * 60) }); }
    else ledger.push({ child_id: child.id, amount: 0, reason: `Refusée puis remboursée : ${r.name}`, kind: 'reward', created_at: isoTime(day, 20 * 60) });
  }
  // Une demande en attente, pour tester l'écran de validation du parent.
  if (pastActionRewards[0]?.id) {
    const r = pick(pastActionRewards);
    redemptions.push({ reward_id: r.id, child_id: child.id, reward_name: r.name, reward_emoji: r.emoji, cost_paid: r.cost, status: 'pending', created_at: isoTime(today, 8 * 60) });
    coins -= r.cost;
    ledger.push({ child_id: child.id, amount: -r.cost, reason: r.name, kind: 'reward', created_at: isoTime(today, 8 * 60) });
  }

  // ------------------------------------------------------------- avatars possédés
  const childItems = [{ child_id: child.id, item_type: 'avatar', item_value: '🦊', acquired_at: isoTime(addDays(today, -90), 0) }];
  const finalLevel = levelOf(xp).level;
  for (const it of itemRewards) {
    if (it.unlock_level && it.unlock_level <= finalLevel) {
      childItems.push({ child_id: child.id, reward_id: it.id, item_type: it.item_type, item_value: it.item_value, acquired_at: isoTime(addDays(today, -randi(1, 60)), 12 * 60) });
    } else if (!it.unlock_level && Math.random() < 0.5 && coins >= it.cost) {
      coins -= it.cost;
      ledger.push({ child_id: child.id, amount: -it.cost, reason: it.name, kind: 'reward', created_at: isoTime(addDays(today, -randi(1, 60)), 12 * 60) });
      childItems.push({ child_id: child.id, reward_id: it.id, item_type: it.item_type, item_value: it.item_value, acquired_at: isoTime(addDays(today, -randi(1, 60)), 12 * 60) });
    }
  }

  // ------------------------------------------------------------------ contrats
  contracts.push({
    child_id: child.id, week_start: addDays(today, -21), title: 'Une semaine sans aucun report',
    metric: 'tasks_done', target: 15, reward_text: '10 € et un ciné', reward_coins: 150, status: 'achieved',
  });
  contractsAchieved = 1;
  checkBadges(addDays(today, -21));
  contracts.push({
    child_id: child.id, week_start: addDays(today, -7), title: '20 tâches cette semaine',
    metric: 'tasks_done', target: 20, reward_text: 'Sortie avec les copines', reward_coins: 100, status: 'failed',
  });

  // -------------------------------------------------------------- tâches à venir
  for (const day of futureDays) {
    const d = dow(day);
    if (d === 0 || d === 6) continue;
    const n = randi(2, 4);
    let startMin = toMin(String(s.day_start).slice(0, 5));
    for (let i = 0; i < n; i++) {
      const subjName = pick(Object.keys(TOPICS));
      const subject = subjects.find((x) => x.name === subjName);
      const duration = weighted([[30, 3], [45, 4], [60, 2]]);
      const difficulty = weighted([[1, 2], [2, 4], [3, 2]]);
      const flexible = Math.random() < 0.3;
      const coinsBase = suggestCoins(duration, difficulty);
      tasksToInsert.push({
        child_id: child.id, day, title: `${pick(VERBS)} ${pick(TOPICS[subjName])}`, subject_id: subject?.id ?? null,
        start_time: flexible ? null : fromMin(startMin), duration_min: duration, is_flexible: flexible,
        difficulty, coins: coinsBase, allow_postpone: true, status: 'todo', active_seconds: 0,
      });
      startMin += duration + 20;
    }
  }
  // Un quiz tout neuf, non commencé, envoyé par le parent — pour voir la carte sur l'accueil.
  quizzes.push({
    child_id: child.id, title: 'Maths — les équations', subject: 'Maths', source: 'parent', assigned_by: parent.id,
    created_at: isoTime(today, 7 * 60),
    questions: Array.from({ length: 10 }, (_, i) => ({
      q: `Question ${i + 1} sur les équations ?`, choices: ['A', 'B', 'C', 'D'], answer: randi(0, 3), why: 'Explication de la bonne réponse.',
    })),
  });

  // ------------------------------------------------------------------- écriture
  console.log(`Insertion : ${tasksToInsert.length} tâches, ${quizzes.length} quiz, ${moods.length} humeurs, ${messages.length} messages…`);
  await insertAll('routines', routines);
  await insertAll('tasks', tasksToInsert);
  await insertAll('moods', moods);
  await insertAll('messages', messages);
  await insertAll('ledger', ledger);
  await insertAll('redemptions', redemptions);
  await insertAll('contracts', contracts, 'child_id,week_start');
  await insertAll('child_items', childItems, 'child_id,item_type,item_value');
  if (earnedBadges.length) await insertAll('earned_badges', earnedBadges, 'child_id,code');

  const { data: insertedQuizzes, error: qErr } = await db.from('quizzes').insert(quizzes).select('id');
  if (qErr) throw new Error(`quizzes: ${qErr.message}`);
  const attemptRows = quizAttemptsBySlot.map(({ quizIndex, day, score, total, answers }) => ({
    quiz_id: insertedQuizzes[quizIndex].id, child_id: child.id, answers,
    score, total, coins_earned: score * s.quiz_coins_per_answer, created_at: isoTime(day, 17 * 60),
  }));
  await insertAll('quiz_attempts', attemptRows);

  await db.from('profiles').update({
    coins: Math.max(0, Math.round(coins)), xp: Math.round(xp), level_reached: finalLevel,
    streak_current: streak, streak_best: bestStreak, last_streak_day: lastCompleteDay,
  }).eq('id', child.id);

  console.log('\n✅ Terminé.');
  console.log(`   Solde final     : ${Math.round(coins)} points`);
  console.log(`   XP / niveau     : ${Math.round(xp)} XP · niveau ${finalLevel}`);
  console.log(`   Série actuelle  : ${streak} j (record ${bestStreak})`);
  console.log(`   Tâches faites   : ${tasksTotal}`);
  console.log(`   Journées 100 %  : ${perfectDays}`);
  console.log(`   Badges débloqués: ${earnedBadges.length}`);
  console.log(`   Meilleur quiz   : ${bestQuizPct} %`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
