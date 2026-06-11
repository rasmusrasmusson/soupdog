// src/app/api/assistant/route.ts
//
// Site-wide knowledge assistant. Page-aware, Soupdog/food-scoped, READ-ONLY
// (answers/explains/finds — never edits the entity). Streams SSE like the
// recipe chat, routes Haiku/Sonnet by intent, logs usage, and gates on
// hasAiAccess() — the same seam Stripe will harden.
//
// POST body: { context: { entityType, entityName, summary?, facts? },
//              message, history? }
//   context  — what page/entity the user is looking at (so "substitute this?"
//              resolves to the current thing). All fields optional except
//              entityType for framing.
//   history  — [{ role:'user'|'assistant', content }] prior turns.

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiStreamStart, makeUsageCollector } from '@/lib/ai/anthropic';
import { hasAiAccess } from '@/lib/ai/access';

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

function systemPrompt(ctx: any): string {
  const where = ctx?.entityName
    ? `The user is currently looking at the ${ctx.entityType ?? 'page'} "${ctx.entityName}" on Soupdog.`
    : `The user is browsing Soupdog.`;
  const facts = ctx?.facts
    ? `\n\nWhat Soupdog knows about it:\n${typeof ctx.facts === 'string' ? ctx.facts : JSON.stringify(ctx.facts)}`
    : '';
  const summary = ctx?.summary ? `\n\nSummary: ${ctx.summary}` : '';

  return `You are Soupdog's assistant — a knowledgeable, friendly helper for the Soupdog food platform.

${where}${summary}${facts}

You help with anything on Soupdog and anything about food: ingredients, tools and kitchen equipment, cooking techniques, recipes, nutrition, flavour pairings, substitutions, meal planning, and how to use the Soupdog site itself. When the user says "this" or "it" without naming something, they mean the ${ctx?.entityType ?? 'thing'} they are currently viewing${ctx?.entityName ? ` (${ctx.entityName})` : ''}.

You ONLY help with food, cooking, nutrition, kitchen equipment, and Soupdog itself. If asked about anything unrelated (politics, programming, general trivia, personal advice, etc.), politely say you can only help with food and Soupdog — briefly, without lecturing — and offer to help with something food-related instead.

You answer and explain. You do NOT modify the page, edit content, or claim to have changed anything — you are a helpful guide, not an editor.

Keep answers concise, practical, and warm. Plain text only — no markdown bold, headings, or bullet syntax. A few short paragraphs at most. Where it helps, suggest a relevant next step on Soupdog (e.g. "you can see recipes that use this under How to use").`;
}

function looksLikeQuestion(message: string): boolean {
  const q = message.trim().toLowerCase();
  if (q.endsWith('?')) return true;
  const starters = ['what', 'why', 'how', 'when', 'where', 'which', 'who',
    'can i', 'could i', 'is it', 'are there', 'do i', 'should i', 'tell me',
    'explain', 'help', 'suggest', 'recommend', 'compare'];
  return starters.some(s => q.startsWith(s));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Access gate — the seam Stripe later hardens.
  const access = hasAiAccess(user);
  if (!access.hasAccess) {
    return new Response(
      JSON.stringify({ error: access.reason === 'logged_out' ? 'Sign in to use the assistant.' : 'Upgrade required.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { context, message, history } = await req.json();
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 });
  }

  // Read-only assistant: questions are the norm. Use Haiku for typical Q&A,
  // Sonnet only for clearly complex asks (comparisons / multi-part).
  const complex = /compare|difference between|vs\.?|versus|step by step|walk me through/i.test(message);
  const useHaiku = !complex;
  const model = useHaiku ? HAIKU_MODEL : SONNET_MODEL;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of (history ?? [])) {
    if (turn?.role && turn?.content) messages.push({ role: turn.role, content: String(turn.content) });
  }
  messages.push({ role: 'user', content: message.trim() });

  try {
    const started = await aiStreamStart({
      model,
      feature: 'chat_question',
      accountId: user!.id,
      max_tokens: useHaiku ? 1200 : 2000,
      system: systemPrompt(context),
      messages,
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
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const event = JSON.parse(data);
                usage.observe(event);
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'chunk', text: event.delta.text })}\n\n`));
                }
              } catch { /* skip malformed */ }
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
