/**
 * Termine le peuplement de test là où seed-history.mjs s'est arrêté.
 *
 * Plutôt que de rejouer toute la simulation (ce qui doublerait tâches,
 * humeurs, messages et grand livre déjà écrits avec succès), ce script
 * recalcule les totaux finaux directement à partir de ce qui est réellement
 * en base — donc juste, quel que soit l'état où l'interruption a eu lieu —
 * puis ajoute ce qui manquait encore : quiz, avatars, badges, profil final.
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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[randi(0, arr.length - 1)];
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const isoTime = (iso, minutes) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + minutes * 60000).toISOString();

const TOPICS = {
  'Maths': ['les fractions', 'Thalès', 'Pythagore', 'les équations', 'les probabilités'],
  'Français': ['le résumé de chapitre', 'la dictée', 'l’analyse du texte', 'la conjugaison'],
  'Histoire-Géo': ['la Première Guerre mondiale', 'la décolonisation', 'les espaces urbains'],
  'Anglais': ['le vocabulaire de l’unité 4', 'le prétérit', 'les verbes irréguliers'],
  'SVT': ['la reproduction', 'la génétique', 'le système nerveux'],
  'Physique-Chimie': ['les atomes', 'les circuits électriques', 'l’énergie'],
};
const AVATAR_CANDIDATES = ['🐧', '🐱', '🐼', '🐶', '🐨', '🐯', '🦁', '🐸', '🌸', '⚡'];

async function insertAll(table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = onConflict
    ? await db.from(table).upsert(rows, { onConflict, ignoreDuplicates: true })
    : await db.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const [{ data: profiles }, { data: s }, { data: subjects }, { data: badges }, { data: rewards }] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('settings').select('*').eq('id', 1).maybeSingle(),
    db.from('subjects').select('*').eq('active', true),
    db.from('badges').select('*'),
    db.from('rewards').select('*'),
  ]);
  const child = profiles.find((p) => p.role === 'child');
  const parent = profiles.find((p) => p.role === 'parent');

  // ------------------------------------------------------- vérité depuis la base
  const [{ data: ledgerRows }, { data: taskRows }, { data: contractRows }] = await Promise.all([
    db.from('ledger').select('amount').eq('child_id', child.id),
    db.from('tasks').select('day,status,xp_awarded').eq('child_id', child.id),
    db.from('contracts').select('status').eq('child_id', child.id),
  ]);

  const coinsFromLedger = ledgerRows.reduce((n, r) => n + r.amount, 0);
  const tasksTotal = taskRows.filter((t) => t.status === 'done').length;
  const xpFromTasks = taskRows.reduce((n, t) => n + (t.xp_awarded ?? 0), 0);
  const contractsAchieved = contractRows.filter((c) => c.status === 'achieved').length;

  // Complétude par jour, pour la série et les journées parfaites.
  const byDay = new Map();
  for (const t of taskRows) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day).push(t.status);
  }
  const sortedDays = [...byDay.keys()].sort();
  let perfectDays = 0, streak = 0, bestStreak = 0, lastCompleteDay = null;
  for (const day of sortedDays) {
    const statuses = byDay.get(day).filter((st) => st !== 'skipped');
    const complete = statuses.length > 0 && statuses.every((st) => st === 'done');
    if (complete) {
      perfectDays += 1;
      streak = lastCompleteDay === addDays(day, -1) ? streak + 1 : 1;
      bestStreak = Math.max(bestStreak, streak);
      lastCompleteDay = day;
    } else if (statuses.length > 0) {
      streak = 0;
    }
  }

  // ---------------------------------------------------------------- quiz
  const today = isoDay(new Date());
  const quizzes = [];
  const attemptsBySlot = [];
  let xpFromQuiz = 0, bestQuizPct = 0;

  for (let i = 0; i < 15; i++) {
    const day = addDays(today, -randi(2, 88));
    const subjName = pick(Object.keys(TOPICS));
    const nQ = 10;
    const questions = Array.from({ length: nQ }, (_, k) => ({
      q: `Question ${k + 1} sur ${pick(TOPICS[subjName])} ?`,
      choices: ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
      answer: randi(0, 3), why: 'C’est la bonne réponse d’après le cours.',
    }));
    const fromParentQuiz = Math.random() < 0.25;
    quizzes.push({
      child_id: child.id, title: `${subjName} — ${pick(TOPICS[subjName])}`, subject: subjName, questions,
      source: fromParentQuiz ? 'parent' : 'child', assigned_by: fromParentQuiz ? parent.id : null,
      created_at: isoTime(day, 16 * 60),
    });
    const attempts = randi(1, 3);
    let base = randi(3, 6);
    for (let a = 0; a < attempts; a++) {
      const score = Math.min(nQ, base + a * randi(1, 2));
      const correctIdx = new Set();
      while (correctIdx.size < score) correctIdx.add(randi(0, nQ - 1));
      const answers = questions.map((q, k) => (correctIdx.has(k) ? q.answer : (q.answer + 1 + randi(0, 2)) % 4));
      attemptsBySlot.push({ quizIndex: i, day: addDays(day, a), score, total: nQ, answers });
      bestQuizPct = Math.max(bestQuizPct, Math.round((score / nQ) * 100));
      xpFromQuiz += score * (s.xp_per_quiz_answer ?? 5);
    }
  }
  // Un quiz tout neuf non commencé, envoyé par le parent — pour la carte sur l'accueil.
  quizzes.push({
    child_id: child.id, title: 'Maths — les équations', subject: 'Maths', source: 'parent', assigned_by: parent.id,
    created_at: isoTime(today, 7 * 60),
    questions: Array.from({ length: 10 }, (_, k) => ({ q: `Question ${k + 1} sur les équations ?`, choices: ['A', 'B', 'C', 'D'], answer: randi(0, 3), why: 'Explication.' })),
  });

  console.log(`Quiz : ${quizzes.length}, tentatives : ${attemptsBySlot.length}`);
  const { data: insertedQuizzes, error: qErr } = await db.from('quizzes').insert(quizzes).select('id');
  if (qErr) throw new Error(`quizzes: ${qErr.message}`);
  const coinsFromQuiz = attemptsBySlot.reduce((n, a) => n + a.score * s.quiz_coins_per_answer, 0);
  await insertAll('quiz_attempts', attemptsBySlot.map(({ quizIndex, day, score, total, answers }) => ({
    quiz_id: insertedQuizzes[quizIndex].id, child_id: child.id, answers, score, total,
    coins_earned: score * s.quiz_coins_per_answer, created_at: isoTime(day, 17 * 60),
  })));
  await insertAll('ledger', attemptsBySlot.map((a) => ({
    child_id: child.id, amount: a.score * s.quiz_coins_per_answer,
    reason: `Quiz : ${quizzes[a.quizIndex].title}`, kind: 'quiz', created_at: isoTime(a.day, 17 * 60),
  })));

  // -------------------------------------------------------------- finances
  const finalXp = xpFromTasks + xpFromQuiz;
  const finalCoinsBeforeAvatars = coinsFromLedger + coinsFromQuiz;
  const finalLevel = Math.floor(finalXp / Math.max(1, s.xp_per_level)) + 1;

  // -------------------------------------------------------------- avatars
  const itemRewards = rewards.filter((r) => r.kind === 'item');
  const childItems = [{ child_id: child.id, item_type: 'avatar', item_value: '🦊', acquired_at: isoTime(addDays(today, -90), 0) }];
  let spentOnAvatars = 0;
  for (const it of itemRewards) {
    if (it.unlock_level && it.unlock_level <= finalLevel) {
      childItems.push({ child_id: child.id, reward_id: it.id, item_type: it.item_type, item_value: it.item_value, acquired_at: isoTime(addDays(today, -randi(1, 60)), 12 * 60) });
    }
  }
  for (const emoji of AVATAR_CANDIDATES.slice(0, 3)) {
    childItems.push({ child_id: child.id, item_type: 'avatar', item_value: emoji, acquired_at: isoTime(addDays(today, -randi(1, 70)), 12 * 60) });
  }
  await insertAll('child_items', childItems, 'child_id,item_type,item_value');

  // --------------------------------------------------------------- badges
  const earnedBadges = [];
  let bonusCoins = 0;
  for (const b of badges) {
    const value = {
      streak: bestStreak, tasks_total: tasksTotal, perfect_days: perfectDays,
      quiz_score: bestQuizPct, early_bird: 0, contracts: contractsAchieved, level: finalLevel,
    }[b.rule_kind] ?? 0;
    if (value >= b.rule_value) {
      earnedBadges.push({ child_id: child.id, code: b.code, earned_at: isoTime(addDays(today, -randi(1, 80)), 20 * 60) });
      bonusCoins += b.coins_reward;
    }
  }
  await insertAll('earned_badges', earnedBadges, 'child_id,code');
  if (bonusCoins > 0) {
    await insertAll('ledger', [{ child_id: child.id, amount: bonusCoins, reason: 'Badges débloqués', kind: 'bonus', created_at: isoTime(addDays(today, -10), 20 * 60) }]);
  }

  const finalCoins = Math.max(0, Math.round(finalCoinsBeforeAvatars + bonusCoins));

  await db.from('profiles').update({
    coins: finalCoins, xp: Math.round(finalXp), level_reached: finalLevel,
    streak_current: streak, streak_best: bestStreak, last_streak_day: lastCompleteDay,
  }).eq('id', child.id);

  console.log('\n✅ Terminé.');
  console.log(`   Solde final     : ${finalCoins} points`);
  console.log(`   XP / niveau     : ${Math.round(finalXp)} XP · niveau ${finalLevel}`);
  console.log(`   Série actuelle  : ${streak} j (record ${bestStreak})`);
  console.log(`   Tâches faites   : ${tasksTotal}`);
  console.log(`   Journées 100 %  : ${perfectDays}`);
  console.log(`   Badges débloqués: ${earnedBadges.length}`);
  console.log(`   Meilleur quiz   : ${bestQuizPct} %`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
