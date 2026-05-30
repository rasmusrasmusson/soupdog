// src/app/api/recipes/import/chat/route.ts
// POST — streaming conversational recipe assistant
// Haiku for questions/answers, Sonnet for modifications

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are Soupdog's assistant — a knowledgeable helper for the Soupdog food platform.

You help users with:
- Recipes: modifications, substitutions, scaling, techniques, timing
- Food & cooking: ingredients, flavour pairings, cooking methods, cuisines
- Nutrition: calories, macros, dietary needs, allergens, health considerations
- Kitchen appliances & equipment: usage, settings, recommendations
- Soupdog platform: how to use the site, import recipes, edit recipes, save recipes, navigation

You do NOT help with topics unrelated to food, cooking, nutrition, appliances, or Soupdog. If asked about anything else, politely say you can only help with food and Soupdog-related questions.

The user is currently working on a recipe. They may ask questions OR give instructions to modify it.
Detect the intent and respond in one of two ways:

FOR QUESTIONS / CONVERSATIONAL (anything asking for information, explanation, advice, or suggestions):
Return JSON: { "type": "answer", "answer": "your helpful response here" }
Keep answers concise and practical. Use plain text — no markdown bold or bullets in the answer string.

FOR MODIFICATION INSTRUCTIONS (imperative requests to change the recipe):
Return JSON:
{
  "type": "modification",
  "requiresConfirmation": boolean,
  "changeSummary": "short plain-English description of what changed",
  "recipe": { ...complete updated recipe... }
}

requiresConfirmation = true for large/destructive changes (substituting main ingredients, changing cooking method, restructuring the recipe, affecting more than ~4 steps).
requiresConfirmation = false for small precise changes (scaling, adding timing, single tweak).

SOUPDOG RECIPE RULES (modifications only):
- Each step is ONE ATOMIC ACTION
- stepTools REQUIRED for almost every step — consistent names across steps
- taskFamily: cut | move | heat_dry | heat_wet | heat_machine | mix | passive | prepare | finish
- Quantities metric, duration in minutes, temperature in Celsius
- Always update top-level ingredients array to match steps

Recipe JSON structure:
{
  "title": string,
  "description": string,
  "cuisine": string | null,
  "difficulty": "easy" | "medium" | "hard",
  "servings": number,
  "totalTimeMinutes": number,
  "activeTimeMinutes": number | null,
  "tags": string[],
  "ingredients": [{ "name": string, "quantityValue": number, "quantityUnit": string, "prepNote": string | null, "optional": boolean }],
  "equipment": string[],
  "groups": [{
    "outputName": string,
    "steps": [{
      "instruction": string,
      "durationMinutes": number,
      "temperatureCelsius": number | null,
      "taskFamily": string,
      "stepIngredients": string[],
      "stepTools": string[]
    }]
  }]
}

Respond with ONLY valid JSON — no markdown, no backticks.`;

// Heuristic: is this likely a question or a modification?
function looksLikeQuestion(message: string): boolean {
  const q = message.trim().toLowerCase();
  if (q.endsWith('?')) return true;
  const questionStarters = ['what', 'why', 'how', 'when', 'where', 'which', 'who', 'can i', 'could i', 'is it', 'are there', 'do i', 'should i', 'tell me', 'explain', 'help me understand'];
  return questionStarters.some(s => q.startsWith(s));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { recipe, message, history } = await req.json();
  if (!recipe || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'recipe and message required' }), { status: 400 });
  }

  // Choose model based on likely intent — Haiku for questions, Sonnet for modifications
  const useHaiku = looksLikeQuestion(message);
  const model    = useHaiku ? HAIKU_MODEL : SONNET_MODEL;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const turn of (history ?? [])) {
    messages.push({ role: 'user', content: turn.user });
    if (turn.type === 'answer') {
      messages.push({ role: 'assistant', content: JSON.stringify({ type: 'answer', answer: turn.assistantSummary }) });
    } else {
      messages.push({ role: 'assistant', content: JSON.stringify({ type: 'modification', changeSummary: turn.assistantSummary, recipe: turn.recipe }) });
    }
  }

  const userContent = history?.length > 0
    ? `${message.trim()}\n\nCurrent recipe JSON:\n${JSON.stringify(recipe)}`
    : `Here is the current recipe:\n\n${JSON.stringify(recipe)}\n\nUser message: ${message.trim()}`;

  messages.push({ role: 'user', content: userContent });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: useHaiku ? 2000 : 6000,
        system:     SYSTEM_PROMPT,
        messages,
        stream:     true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[chat] Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'Request failed' }), { status: 502 });
    }

    // Stream the response back, collecting the full text as we go
    // We send a special header so the client knows to expect streaming
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const event = JSON.parse(data);
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  const text = event.delta.text;
                  fullText += text;
                  // Stream text chunks to client
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`));
                }
              } catch { /* skip malformed events */ }
            }
          }

          // Parse the complete response and send the final parsed result
          const clean = fullText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

          let parsed: any;
          try {
            parsed = JSON.parse(clean);
          } catch {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Could not parse response' })}\n\n`));
            controller.close();
            return;
          }

          if (parsed.type === 'answer') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', responseType: 'answer', answer: parsed.answer })}\n\n`));
          } else {
            const updated = parsed.recipe ?? parsed;
            if (!updated.title || !Array.isArray(updated.ingredients) || !Array.isArray(updated.groups)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Incomplete recipe structure' })}\n\n`));
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type:                 'done',
                responseType:         'modification',
                recipe:               updated,
                requiresConfirmation: parsed.requiresConfirmation ?? false,
                changeSummary:        parsed.changeSummary ?? 'Recipe updated',
              })}\n\n`));
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });

  } catch (err: any) {
    console.error('[chat]', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Request failed' }), { status: 500 });
  }
}
