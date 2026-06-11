// src/app/api/assistant/route.ts
//
// Site-wide knowledge assistant. Page-aware, Soupdog/food-scoped. Mostly
// READ-ONLY (answers/explains) but can NAVIGATE: when the user asks to be taken
// somewhere ("show me the lemon page", "open chicken tikka"), the assistant
// resolves the real slug server-side (never guesses a URL -> never 404s) and
// tells the client to navigate.
//
// Flow:
//   1. A fast non-streaming intent classifier decides: navigate vs answer.
//   2. If NAVIGATE -> resolve {query,type} against search_index + equipment ->
//      return JSON {navigate, label} (no streaming).
//   3. If ANSWER -> stream the reply as before (SSE).
//
// Navigation is the assistant's first ACTION; the same {action:…} shape extends
// later to add-to-plan / save / etc. (those touch the write/access seam).

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

You answer and explain. Keep answers concise, practical, and warm. Plain text only — no markdown bold, headings, or bullet syntax. A few short paragraphs at most.`;
}

async function classify(message: string, ctx: any, accountId: string): Promise<
  { kind: 'navigate'; query: string; entityType?: string } | { kind: 'answer' }
> {
  const sys = `You classify a user's message to Soupdog's assistant into one of two intents and reply with ONLY JSON.

If the user wants to be TAKEN TO / SHOWN / OPEN a specific page for a named thing (an ingredient, tool, technique, or recipe), reply:
{"kind":"navigate","query":"<the thing's name>","entityType":"ingredient|tool|technique|recipe"}
- "query" is the plain name to look up (e.g. "lemon", "chicken tikka masala", "immersion circulator").
- "entityType" is your best guess of which kind of page; omit if unsure.
- If they say "this"/"it" and are currently looking at something, use that thing's name and type.

For ANYTHING ELSE (questions, explanations, advice, substitutions, general chat), reply:
{"kind":"answer"}

Examples:
"show me the lemon page" -> {"kind":"navigate","query":"lemon","entityType":"ingredient"}
"take me to chicken tikka masala" -> {"kind":"navigate","query":"chicken tikka masala","entityType":"recipe"}
"open this" (looking at Lemon) -> {"kind":"navigate","query":"lemon","entityType":"ingredient"}
"what can I substitute for lemon?" -> {"kind":"answer"}
"how do I store it?" -> {"kind":"answer"}

Reply with ONLY the JSON, no markdown.`;

  const ctxNote = ctx?.entityName ? `\n\n(The user is currently looking at: ${ctx.entityName}${ctx.entityType ? ` — a ${ctx.entityType}` : ''}.)` : '';

  const r = await aiMessage({
    model: HAIKU_MODEL,
    feature: 'chat_question',
    accountId,
    max_tokens: 120,
    system: sys,
    messages: [{ role: 'user', content: message.trim() + ctxNote }],
  });
  if (!r.ok || !r.data) return { kind: 'answer' };
  const text = (r.data.content ?? []).map((c: any) => c.type === 'text' ? c.text : '').join('').trim();
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?/, '').replace(/```$/, '').trim());
    if (parsed?.kind === 'navigate' && parsed.query) {
      return { kind: 'navigate', query: String(parsed.query), entityType: parsed.entityType };
    }
  } catch { /* fall through */ }
  return { kind: 'answer' };
}

async function resolveDestination(db: any, query: string, entityType?: string):
  Promise<{ url: string; label: string } | null> {

  const q = query.trim();
  if (!q) return null;

  async function tryTool(): Promise<{ url: string; label: string } | null> {
    const { data } = await db.from('equipment')
      .select('slug, name').ilike('name', `%${q}%`).is('parent_id', null).limit(5);
    if (data?.length) {
      const exact = data.find((r: any) => r.name.toLowerCase() === q.toLowerCase()) ?? data[0];
      return { url: `/tools/${exact.slug}`, label: exact.name };
    }
    return null;
  }

  async function tryIndex(type?: string): Promise<{ url: string; label: string } | null> {
    let sel = db.from('search_index').select('slug, type, title').ilike('title', `%${q}%`).limit(8);
    if (type && URL_PREFIX[type]) sel = sel.eq('type', type);
    const { data } = await sel;
    if (!data?.length) return null;
    const exact = data.find((r: any) => (r.title ?? '').toLowerCase() === q.toLowerCase()) ?? data[0];
    const prefix = URL_PREFIX[exact.type];
    if (!prefix) return null;
    return { url: `${prefix}${exact.slug}`, label: exact.title };
  }

  if (entityType === 'tool') {
    return (await tryTool()) ?? (await tryIndex());
  }
  return (await tryIndex(entityType)) ?? (await tryIndex()) ?? (await tryTool());
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

  // 1. Classify: navigate vs answer
  const intent = await classify(message, context, user!.id);

  if (intent.kind === 'navigate') {
    const dest = await resolveDestination(db, intent.query, intent.entityType);
    if (dest) {
      return new Response(JSON.stringify({ navigate: dest.url, label: dest.label }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      answerText: `I couldn't find a page for "${intent.query}" on Soupdog. It may not be in the library yet.`,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 2. Answer (stream)
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
