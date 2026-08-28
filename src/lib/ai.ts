import Anthropic from '@anthropic-ai/sdk';
import type { QuizQuestion } from './types';

function buildSystem(nQuestions: number, nChoices: number): string {
  return `Tu es un professeur de collège français qui prépare des élèves de 3e au Brevet.
On te donne la photo d'une leçon (manuscrite ou imprimée). Tu produis un quiz de révision active.

Règles strictes :
- Lis attentivement TOUT ce qui est visible sur l'image, y compris l'écriture manuscrite.
- Génère exactement ${nQuestions} questions à choix multiples portant UNIQUEMENT sur le contenu de cette leçon.
- ${nChoices} propositions par question, une seule correcte. Les mauvaises réponses doivent être plausibles, pas absurdes.
- Varie : définitions, applications, pièges classiques, cas concrets. Pas seulement du par-cœur.
- Formule en français simple et direct, tutoiement.
- Pour chaque question, "why" explique la bonne réponse en une phrase courte et utile.
- Si l'image est illisible ou ne contient pas de leçon, renvoie {"error":"..."} en expliquant pourquoi.

Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans bloc de code :
{"title":"...","subject":"...","questions":[{"q":"...","choices":[${Array(nChoices).fill('"..."').join(',')}],"answer":0,"why":"..."}]}`;
}

export interface QuizResult { title: string; subject: string; questions: QuizQuestion[]; provider: string; }
export interface QuizOptions { questions: number; choices: number; }
const DEFAULT_OPTS: QuizOptions = { questions: 10, choices: 4 };

function parseJSON(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { /* on retente */ }
  const first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error('Réponse IA illisible');
}

function normalize(data: any, provider: string, opts: QuizOptions): QuizResult {
  if (data?.error) throw new Error(String(data.error));
  const questions: QuizQuestion[] = (data.questions ?? [])
    .filter((q: any) => q?.q && Array.isArray(q.choices) && q.choices.length >= 2)
    .slice(0, opts.questions)
    .map((q: any) => ({
      q: String(q.q),
      choices: q.choices.map(String).slice(0, opts.choices),
      answer: Math.max(0, Math.min(q.choices.length - 1, Number(q.answer) || 0)),
      why: q.why ? String(q.why) : undefined,
    }));
  if (!questions.length) throw new Error("L'IA n'a pas réussi à lire la leçon sur cette photo.");
  return { title: String(data.title ?? 'Quiz de révision'), subject: String(data.subject ?? ''), questions, provider };
}

/**
 * Les clés « identity-linked » d'Anthropic exigent l'en-tête
 * `anthropic-workspace-id` ; les clés classiques l'ignorent. On l'envoie donc
 * dès qu'il est configuré, ce qui rend le code compatible avec les deux types.
 */
function anthropicClient() {
  const ws = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    ...(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {}),
  });
}

async function viaAnthropic(base64: string, mime: string, hint: string, opts: QuizOptions): Promise<QuizResult> {
  const client = anthropicClient();
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    max_tokens: 4000,
    system: buildSystem(opts.questions, opts.choices),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime as any, data: base64 } },
        { type: 'text', text: hint ? `Contexte donné par le parent : ${hint}` : 'Génère le quiz de cette leçon.' },
      ],
    }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
  return normalize(parseJSON(text), 'anthropic', opts);
}

async function viaGroq(base64: string, mime: string, hint: string, opts: QuizOptions): Promise<QuizResult> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_VISION_MODEL || '',
      temperature: 0.3,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `${buildSystem(opts.questions, opts.choices)}\n\n${hint ? `Contexte : ${hint}` : ''}` },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return normalize(parseJSON(json.choices?.[0]?.message?.content ?? ''), 'groq', opts);
}

/**
 * Lecture d'une photo de leçon. Nécessite un modèle multimodal : Groq n'en
 * propose plus depuis le retrait de Llama 4 Scout (ses modèles actuels
 * répondent « over capacity » à toute requête contenant une image), donc on
 * passe par Anthropic — sauf si un modèle vision Groq est explicitement fourni.
 */
export async function generateQuiz(base64: string, mime: string, hint = '', opts: Partial<QuizOptions> = {}): Promise<QuizResult> {
  const full: QuizOptions = {
    questions: Math.min(15, Math.max(3, opts.questions ?? DEFAULT_OPTS.questions)),
    choices: Math.min(6, Math.max(2, opts.choices ?? DEFAULT_OPTS.choices)),
  };
  if (process.env.ANTHROPIC_API_KEY) return viaAnthropic(base64, mime, hint, full);
  if (process.env.GROQ_API_KEY && process.env.GROQ_VISION_MODEL) return viaGroq(base64, mime, hint, full);
  throw new Error("Le quiz par photo demande une clé ANTHROPIC_API_KEY (Groq ne lit plus les images).");
}

/** Découpe une tâche vague en micro-étapes concrètes. */
export async function splitTask(title: string, description: string): Promise<string[]> {
  const prompt = `Découpe cette tâche scolaire de 3e en 3 à 5 micro-étapes très concrètes et courtes.
Chaque étape doit être une action immédiatement faisable ("Ouvre le cahier page 42", pas "Réviser").
La première étape doit être ridiculement facile, pour lever le blocage du démarrage.
Tâche : « ${title} »${description ? `\nDétail : ${description}` : ''}
Réponds uniquement avec un tableau JSON de chaînes, rien d'autre.`;

  // Tâche purement textuelle : on la confie à Groq, qui est gratuit, et on
  // réserve les crédits Anthropic à la lecture d'images.
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
          temperature: 0.4, max_tokens: 700,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const json = await res.json();
      const t = (json.choices?.[0]?.message?.content ?? '').trim();
      const arr = parseJSON(t.startsWith('[') ? `{"a":${t}}` : t);
      const steps = (Array.isArray(arr) ? arr : arr.a ?? []).map(String).slice(0, 6);
      if (steps.length) return steps;
    } catch { /* on bascule sur Anthropic */ }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const client = anthropicClient();
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    const arr = parseJSON(text.trim().startsWith('[') ? `{"a":${text.trim()}}` : text);
    return (Array.isArray(arr) ? arr : arr.a ?? []).map(String).slice(0, 6);
  }
  throw new Error('Aucune clé IA configurée (GROQ_API_KEY ou ANTHROPIC_API_KEY).');
}
