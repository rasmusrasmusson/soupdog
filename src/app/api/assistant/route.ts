// src/app/api/assistant/route.ts
//
// Site-wide knowledge assistant. Page-aware, Soupdog/food-scoped. Three intents:
//   • NAVIGATE — "take me to X" → resolve real slug → client navigates.
//   • SEARCH   — "do you have X?" / "what recipes use Y?" → look up the REAL
//     library, then answer FROM the results (offer to open). The assistant must
//     never claim the library lacks something without actually searching.
//   • ANSWER   — everything else → stream a normal reply.
//
// Slugs/results come from search_index (ingredient/recipe/technique) + equipment
// (tools). The AI never invents URLs or claims about library contents.

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage, aiStreamStart, makeUsageCollector } from '@/lib/ai/anthropic';
import { hasAiAccess } from '@/lib/ai/access';

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

const URL_PREFIX: Record<string, string> = {
  ingredient: '/ingredients/',
  recipe:     '/recipes/',
  technique:  '/techniques/',
  tool:       '/tools/',
};

function systemPrompt(ctx: any): string {
  const where = ctx?.entityName
    ? `The user is currently looking at the ${ctx.entityType ?? 'page'} "${ctx.entityName}" on Soupdog.`
    : `The user is browsing Soupdog.`;
  const facts = ctx?.facts ? `\n\nWhat Soupdog knows about it:\n${typeof ctx.facts === 'string' ? ctx.facts : JSON.stringify(ctx.facts)}` : '';
  const summary = ctx?.summary ? `\n\nSummary: ${ctx.summary}` : '';
  return `You are Soupdog's assistant — a knowledgeable, friendly helper for the Soupdog food platform.

${where}${summary}${facts}

You help with anything on Soupdog and anything about food: ingredients, tools and kitchen equipment, cooking techniques, recipes, nutrition, flavour pairings, substitutions, meal planning, and how to use the Soupdog site. When the user says "this" or "it" without naming something, they mean the ${ctx?.entityType ?? 'thing'} they are currently viewing${ctx?.entityName ? ` (${ctx.entityName})` : ''}.

You ONLY help with food, cooking, nutrition, kitchen equipment, and Soupdog itself. If asked about anything unrelated, politely say you can only help with food and Soupdog — briefly — and offer to help with something food-related.

IMPORTANT: You do not know the full contents of the Soupdog library from memory. Never claim a recipe/ingredient/etc. does or doesn't exist based on your own knowledge — that is determined by searching, which happens separately.

You answer and explain. Keep answers concise, practical, and warm. Plain text only — no markdown bold, headings, or bullet syntax. A few short paragraphs at most.`;
}

async function classify(message: string, ctx: any, accountId: string): Promise<
  | { kind: 'navigate'; query: string; entityType?: string }
  | { kind: 'search'; query: string; entityType?: string }
  | { kind: 'answer' }
> {
  const sys = `You classify a user's message to Soupdog's assistant into ONE intent and reply with ONLY JSON.

NAVIGATE — the user wants to be TAKEN TO / SHOWN / OPEN a specific page they name:
{"kind":"navigate","query":"<name>","entityType":"ingredient|tool|technique|recipe"}

SEARCH — the user asks WHETHER something exists in Soupdog, or to FIND/LIST things, e.g. "do you have a recipe for X", "is there an X", "what recipes use Y", "find me Z", "any X recipes?":
{"kind":"search","query":"<the thing to look for>","entityType":"ingredient|tool|technique|recipe (omit if unsure)"}

ANSWER — anything else (explanations, advice, substitutions, how-to, general chat):
{"kind":"answer"}

Rules:
- "query" is the plain search term (e.g. "apple pie", "lemon", "sous vide").
- If they say "this"/"it" and are looking at something, use that thing's name.
- Questions about whether Soupdog HAS something are SEARCH, never ANSWER.

Examples:
"show me the lemon page" -> {"kind":"navigate","query":"lemon","entityType":"ingredient"}
"take me to chicken tikka" -> {"kind":"navigate","query":"chicken tikka","entityType":"recipe"}
"do you have a recipe for apple pie?" -> {"kind":"search","query":"apple pie","entityType":"recipe"}
"is there a page on saffron?" -> {"kind":"search","query":"saffron","entityType":"ingredient"}
"what recipes use lemon?" -> {"kind":"search","query":"lemon"}
"find me something with chicken" -> {"kind":"search","query":"chicken","entityType":"recipe"}
"what can I substitute for lemon?" -> {"kind":"answer"}
"how do I store it?" -> {"kind":"answer"}

Reply with ONLY the JSON, no markdown.`;

  const ctxNote = ctx?.entityName ? `\n\n(The user is currently looking at: ${ctx.entityName}${ctx.entityType ? ` — a ${ctx.entityType}` : ''}.)` : '';

  const r = await aiMessage({
    model: HAIKU_MODEL, feature: 'chat_question', accountId, max_tokens: 120,
    system: sys, messages: [{ role: 'user', content: message.trim() + ctxNote }],
  });
  if (!r.ok || !r.data) return { kind: 'answer' };
  const text = (r.data.content ?? []).map((c: any) => c.type === 'text' ? c.text : '').join('').trim();
  try {
    const p = JSON.parse(text.replace(/^```(?:json)?/, '').replace(/```$/, '').trim());
    if (p?.kind === 'navigate' && p.query) return { kind: 'navigate', query: String(p.query), entityType: p.entityType };
    if (p?.kind === 'search' && p.query)   return { kind: 'search',   query: String(p.query), entityType: p.entityType };
  } catch { /* fall through */ }
  return { kind: 'answer' };
}

type Hit = { url: string; label: string; type: string };

// Search the real library. Returns ranked hits across search_index + equipment.
async function searchLibrary(db: any, query: string, entityType?: string): Promise<Hit[]> {
  const q = query.trim();
  if (!q) return [];
  const hits: Hit[] = [];

  // search_index: ingredient / recipe / technique
  let sel = db.from('search_index').select('slug, type, title').ilike('title', `%${q}%`).limit(12);
  if (entityType && entityType !== 'tool' && URL_PREFIX[entityType]) sel = sel.eq('type', entityType);
  const { data: idx } = await sel;
  for (const r of (idx ?? [])) {
    const prefix = URL_PREFIX[r.type];
    if (prefix) hits.push({ url: `${prefix}${r.slug}`, label: r.title, type: r.type });
  }

  // equipment (tools) — include unless the user clearly wanted a non-tool type
  if (!entityType || entityType === 'tool') {
    const { data: eq } = await db.from('equipment')
      .select('slug, name').ilike('name', `%${q}%`).is('parent_id', null).limit(8);
    for (const r of (eq ?? [])) hits.push({ url: `/tools/${r.slug}`, label: r.name, type: 'tool' });
  }

  // Rank: exact title match first, then by label length (closer matches shorter).
  const ql = q.toLowerCase();
  hits.sort((a, b) => {
    const ax = a.label.toLowerCase() === ql ? 0 : 1;
    const bx = b.label.toLowerCase() === ql ? 0 : 1;
    if (ax !== bx) return ax - bx;
    return a.label.length - b.label.length;
  });
  // Dedupe by url
  const seen = new Set<string>();
  return hits.filter(h => (seen.has(h.url) ? false : (seen.add(h.url), true))).slice(0, 6);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();

  const access = hasAiAccess(user);
  if (!access.hasAccess) {
    return new Response(JSON.stringify({ error: access.reason === 'logged_out' ? 'Sign in to use the assistant.' : 'Upgrade required.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { context, message, history } = await req.json();
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 });
  }

  const intent = await classify(message, context, user!.id);

  // ── NAVIGATE ─────────────────────────────────────────────────
  if (intent.kind === 'navigate') {
    const hits = await searchLibrary(db, intent.query, intent.entityType);
    if (hits.length) {
      return new Response(JSON.stringify({ navigate: hits[0].url, label: hits[0].label }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      answerText: `I couldn't find a page for "${intent.query}" on Soupdog. It may not be in the library yet.`,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── SEARCH ───────────────────────────────────────────────────
  if (intent.kind === 'search') {
    const hits = await searchLibrary(db, intent.query, intent.entityType);
    if (hits.length === 0) {
      return new Response(JSON.stringify({
        answerText: `I searched Soupdog and couldn't find anything matching "${intent.query}" yet. I can still help with general cooking questions about it if you like.`,
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    // Single strong hit → tell + offer to open it (client renders a go button).
    if (hits.length === 1 || hits[0].label.toLowerCase() === intent.query.trim().toLowerCase()) {
      const h = hits[0];
      return new Response(JSON.stringify({
        answerText: `Yes — Soupdog has "${h.label}".`,
        navigateOffer: { url: h.url, label: h.label },
        more: hits.slice(1, 4).map(x => ({ url: x.url, label: x.label })),
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    // Several hits → list them as options.
    return new Response(JSON.stringify({
      answerText: `Yes — Soupdog has a few matches for "${intent.query}":`,
      options: hits.slice(0, 5).map(x => ({ url: x.url, label: x.label, type: x.type })),
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── ANSWER (stream) ──────────────────────────────────────────
  const complex = /compare|difference between|vs\.?|versus|step by step|walk me through/i.test(message);
  const model = complex ? SONNET_MODEL : HAIKU_MODEL;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of (history ?? [])) {
    if (turn?.role && turn?.content) messages.push({ role: turn.role, content: String(turn.content) });
  }
  messages.push({ role: 'user', content: message.trim() });

  try {
    const started = await aiStreamStart({
      model, feature: 'chat_question', accountId: user!.id,
      max_tokens: complex ? 2000 : 1200, system: systemPrompt(context), messages,
    });
    if (!started.ok || !started.res) {
      return new Response(JSON.stringify({ error: 'Request failed' }), { status: 502 });
    }
    const res = started.res;
    const usage = makeUsageCollector({ model, feature: 'chat_question', accountId: user!.id });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let success = true;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const event = JSON.parse(data);
                usage.observe(event);
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: event.delta.text })}\n\n`));
                }
              } catch { /* skip */ }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch {
          success = false;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`));
        } finally {
          usage.finish(success);
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Request failed' }), { status: 500 });
  }
}
