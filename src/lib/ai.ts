import Anthropic from '@anthropic-ai/sdk';
import type { QuizQuestion } from './types';

const SYSTEM = `Tu es un professeur de collège français qui prépare des élèves de 3e au Brevet.
On te donne la photo d'une leçon (manuscrite ou imprimée). Tu produis un quiz de révision active.

Règles strictes :
- Lis attentivement TOUT ce qui est visible sur l'image, y compris l'écriture manuscrite.
- Génère exactement 10 questions à choix multiples portant UNIQUEMENT sur le contenu de cette leçon.
- 4 propositions par question, une seule correcte. Les mauvaises réponses doivent être plausibles, pas absurdes.
- Varie : définitions, applications, pièges classiques, cas concrets. Pas seulement du par-cœur.
- Formule en français simple et direct, tutoiement.
- Pour chaque question, "why" explique la bonne réponse en une phrase courte et utile.
- Si l'image est illisible ou ne contient pas de leçon, renvoie {"error":"..."} en expliquant pourquoi.

Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans bloc de code :
{"title":"...","subject":"...","questions":[{"q":"...","choices":["a","b","c","d"],"answer":0,"why":"..."}]}`;

export interface QuizResult { title: string; subject: string; questions: QuizQuestion[]; provider: string; }

function parseJSON(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { /* on retente */ }
  const first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error('Réponse IA illisible');
}

function normalize(data: any, provider: string): QuizResult {
  if (data?.error) throw new Error(String(data.error));
  const questions: QuizQuestion[] = (data.questions ?? [])
    .filter((q: any) => q?.q && Array.isArray(q.choices) && q.choices.length >= 2)
    .slice(0, 12)
    .map((q: any) => ({
      q: String(q.q),
      choices: q.choices.map(String).slice(0, 4),
      answer: Math.max(0, Math.min(q.choices.length - 1, Number(q.answer) || 0)),
      why: q.why ? String(q.why) : undefined,
    }));
  if (!questions.length) throw new Error("L'IA n'a pas réussi à lire la leçon sur cette photo.");
  return { title: String(data.title ?? 'Quiz de révision'), subject: String(data.subject ?? ''), questions, provider };
}

async function viaAnthropic(base64: string, mime: string, hint: string): Promise<QuizResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime as any, data: base64 } },
        { type: 'text', text: hint ? `Contexte donné par le parent : ${hint}` : 'Génère le quiz de cette leçon.' },
      ],
    }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
  return normalize(parseJSON(text), 'anthropic');
}

async function viaGroq(base64: string, mime: string, hint: string): Promise<QuizResult> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.3,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `${SYSTEM}\n\n${hint ? `Contexte : ${hint}` : ''}` },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return normalize(parseJSON(json.choices?.[0]?.message?.content ?? ''), 'groq');
}

export async function generateQuiz(base64: string, mime: string, hint = ''): Promise<QuizResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await viaAnthropic(base64, mime, hint); }
    catch (e) { if (!process.env.GROQ_API_KEY) throw e; }
  }
  if (process.env.GROQ_API_KEY) return viaGroq(base64, mime, hint);
  throw new Error("Aucune clé IA configurée (ANTHROPIC_API_KEY ou GROQ_API_KEY).");
}

/** Découpe une tâche vague en micro-étapes concrètes. */
export async function splitTask(title: string, description: string): Promise<string[]> {
  const prompt = `Découpe cette tâche scolaire de 3e en 3 à 5 micro-étapes très concrètes et courtes.
Chaque étape doit être une action immédiatement faisable ("Ouvre le cahier page 42", pas "Réviser").
La première étape doit être ridiculement facile, pour lever le blocage du démarrage.
Tâche : « ${title} »${description ? `\nDétail : ${description}` : ''}
Réponds uniquement avec un tableau JSON de chaînes, rien d'autre.`;

  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    const arr = parseJSON(text.trim().startsWith('[') ? `{"a":${text.trim()}}` : text);
    return (Array.isArray(arr) ? arr : arr.a ?? []).map(String).slice(0, 6);
  }
  if (process.env.GROQ_API_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.4, max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const json = await res.json();
    const t = (json.choices?.[0]?.message?.content ?? '').trim();
    const arr = parseJSON(t.startsWith('[') ? `{"a":${t}}` : t);
    return (Array.isArray(arr) ? arr : arr.a ?? []).map(String).slice(0, 6);
  }
  throw new Error('Aucune clé IA configurée.');
}
