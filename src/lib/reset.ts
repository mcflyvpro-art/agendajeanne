'use client';
import { supabase } from '@/lib/supabase';

/**
 * Remet le compte de l'enfant à zéro : historique, économie, progression,
 * agenda — tout ce qui constitue « son compte », pas la configuration du
 * parent (matières, boutique, réglages). Après ça, l'app doit se comporter
 * comme à la toute première connexion.
 *
 * Les sous-tâches suivent leurs tâches en cascade (contrainte de clé
 * étrangère), pas besoin de les viser séparément. Les routines n'ont pas de
 * colonne `child_id` — cette app ne gère qu'un seul enfant, elles sont donc
 * toutes supprimées sans condition.
 */
export async function resetChildAccount(childId: string) {
  const byChild = (table: string) => supabase.from(table).delete().eq('child_id', childId);

  await Promise.all([
    byChild('tasks'),
    supabase.from('routines').delete().gte('created_at', '1900-01-01'),
    byChild('quizzes'),          // les tentatives suivent en cascade
    byChild('moods'),
    byChild('ledger'),
    byChild('earned_badges'),
    byChild('child_items'),
    byChild('redemptions'),
    byChild('contracts'),
    supabase.from('messages').delete().or(`from_id.eq.${childId},to_id.eq.${childId}`),
  ]);

  await supabase.from('profiles').update({
    coins: 0, xp: 0, level_reached: 1,
    streak_current: 0, streak_best: 0, streak_freezes: 1, last_streak_day: null,
    avatar_emoji: '🦊',
  }).eq('id', childId);

  // Le renard de départ reste offert, comme à la création du compte.
  await supabase.from('child_items').insert({ child_id: childId, item_type: 'avatar', item_value: '🦊' });
}
