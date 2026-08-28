export type Role = 'parent' | 'child';
export type TaskStatus = 'todo' | 'doing' | 'submitted' | 'done' | 'skipped' | 'missed';
export type Tone = 'doux' | 'neutre' | 'ferme' | 'humour';

export interface Profile {
  id: string;
  role: Role;
  display_name: string;
  avatar_emoji: string;
  color: string;
  coins: number;
  xp: number;
  streak_current: number;
  streak_best: number;
  streak_freezes: number;
  last_streak_day: string | null;
  push_subscription: unknown | null;
  push_enabled: boolean;
  push_checked_at: string | null;
  last_seen_at: string | null;
  level_reached: number;
}

export interface Settings {
  id: number;
  currency_name: string;
  currency_emoji: string;
  base_coins: number;
  coins_per_10min: number;
  difficulty_mult: Record<string, number>;
  punctuality_bonus_pct: number;
  streak_bonus_pct: number;
  quiz_coins_per_answer: number;
  perfect_day_bonus: number;
  xp_per_level: number;
  default_require_photo: boolean;
  default_require_validation: boolean;
  default_min_timer_pct: number;
  default_difficulty: number;
  max_postpones_per_day: number;
  postpone_minutes: number;
  reminder_offsets: number[];
  parent_alert_after: number;
  evening_recap_time: string;
  tomorrow_preview_time: string;
  morning_checkin_time: string;
  day_start: string;
  day_end: string;
  max_daily_minutes: number;
  notif_tone: Tone;
  child_id: string | null;
  timezone: string;
  goal_title: string;
  goal_date: string | null;
  xp_per_task: number;
  xp_per_quiz_answer: number;
  level_up_coins: number;
  daily_xp_goal: number;
  mood_per_day: number;
  notif_parent: Record<ParentNotifKind, boolean>;
  notif_child: Record<ChildNotifKind, boolean>;
}

export type ParentNotifKind =
  | 'task_submitted' | 'quiz_done' | 'purchase' | 'badge'
  | 'level_up' | 'blocked' | 'mood' | 'not_started' | 'recap';

export type ChildNotifKind =
  | 'task_created' | 'kudos' | 'reward_created' | 'contract_created'
  | 'reminders' | 'validation' | 'level_up';

export interface Subject { id: string; name: string; emoji: string; color: string; position: number; active: boolean; }

export interface Task {
  id: string;
  child_id: string;
  created_by: string | null;
  routine_id: string | null;
  subject_id: string | null;
  title: string;
  description: string | null;
  day: string;
  start_time: string | null;
  duration_min: number;
  is_flexible: boolean;
  deadline_time: string | null;
  difficulty: number;
  status: TaskStatus;
  require_photo: boolean | null;
  require_validation: boolean | null;
  min_timer_pct: number | null;
  allow_postpone: boolean;
  link_url: string | null;
  attachment_url: string | null;
  voice_url: string | null;
  parent_note: string | null;
  coins: number;
  coins_awarded: number | null;
  xp_awarded: number | null;
  started_at: string | null;
  completed_at: string | null;
  validated_at: string | null;
  active_seconds: number;
  postpone_count: number;
  proof_url: string | null;
  proof_note: string | null;
  blocked_note: string | null;
  child_note: string | null;
  parent_reaction: string | null;
  reminders_sent: number[];
  parent_alerted: boolean;
  timer_running: boolean;
  timer_segment_at: string | null;
  created_at: string;
  subtasks?: Subtask[];
  subject?: Subject | null;
}

export interface Subtask { id: string; task_id: string; label: string; done: boolean; position: number; }

export interface Routine {
  id: string; title: string; description: string | null; subject_id: string | null;
  days_of_week: number[]; start_time: string; duration_min: number; difficulty: number;
  is_flexible: boolean; coins: number | null; require_photo: boolean | null;
  require_validation: boolean | null; min_timer_pct: number | null; link_url: string | null;
  subtasks: string[]; active: boolean; valid_from: string; valid_to: string | null;
}

export interface Reward {
  id: string; name: string; description: string | null; emoji: string; cost: number;
  category: string; condition: string | null; stock: number | null;
  limit_per_week: number | null; active: boolean; position: number;
  /** `action` = à accorder par le parent · `item` = débloqué immédiatement dans l'app */
  kind: 'action' | 'item';
  item_type: string | null;
  item_value: string | null;
}

export interface ChildItem {
  id: string; child_id: string; reward_id: string | null;
  item_type: string; item_value: string; acquired_at: string;
}

export interface Redemption {
  id: string; reward_id: string | null; child_id: string; reward_name: string;
  reward_emoji: string; cost_paid: number; status: 'pending' | 'approved' | 'refused' | 'delivered';
  child_note: string | null; parent_note: string | null; created_at: string; resolved_at: string | null;
}

export interface LedgerRow {
  id: string; child_id: string; amount: number; reason: string;
  kind: 'task' | 'quiz' | 'bonus' | 'penalty' | 'reward' | 'manual' | 'contract';
  ref_id: string | null; created_at: string;
}

export interface Badge { code: string; name: string; emoji: string; description: string; rule_kind: string; rule_value: number; coins_reward: number; }
export interface EarnedBadge { child_id: string; code: string; earned_at: string; }

export interface Contract {
  id: string; child_id: string; week_start: string; title: string;
  metric: 'tasks_done' | 'coins' | 'minutes' | 'perfect_days'; target: number;
  reward_text: string; reward_coins: number;
  status: 'proposed' | 'accepted' | 'achieved' | 'failed'; child_message: string | null;
}

export interface Message {
  id: string; from_id: string | null; to_id: string; task_id: string | null;
  kind: 'message' | 'kudos' | 'blocked' | 'alert' | 'system';
  body: string; emoji: string | null; read_at: string | null; created_at: string;
}

export interface Mood { id: string; child_id: string; day: string; mood: number; code: string | null; note: string | null; created_at?: string; }

export interface QuizQuestion {
  q: string;
  choices: string[];
  answer: number;
  why?: string;
}
export interface Quiz {
  id: string; child_id: string; task_id: string | null; title: string;
  subject: string | null; source_url: string | null; questions: QuizQuestion[]; created_at: string;
}
export interface QuizAttempt {
  id: string; quiz_id: string; child_id: string; answers: number[];
  score: number; total: number; coins_earned: number; created_at: string;
}
