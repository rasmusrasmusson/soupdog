// src/lib/ai/anthropic.ts
// Single entry point for all Anthropic calls. Every call logs token usage to
// ai_usage_log (fire-and-forget — logging never blocks or breaks the AI call).
// This is also the natural place to enforce tier/quota limits later.

import { createClient } from '@/lib/supabase/server';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export type AiFeature =
  | 'import_parse'
  | 'chat_question'
  | 'chat_modify'
  | 'nutrition_estimate'
  | 'nutrition_backfill'
  | 'meal_plan'
  | 'meal_merge'
  | 'recipe_generate'
  | 'other';

type LogArgs = {
  accountId: string | null;
  personId?: string | null;
  model: string;
  feature: AiFeature;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  error?: string | null;
  db?: any; // optional pre-existing client (background/service contexts where a
            // fresh server client wouldn't carry the session). If omitted, a
            // server client is created.
};

// Fire-and-forget insert into ai_usage_log. Swallows its own errors so a
// logging failure can never break the user-facing AI response.
export async function logAiUsage(a: LogArgs): Promise<void> {
  try {
    const db = a.db ?? ((await createClient()) as any);
    await db.from('ai_usage_log').insert({
      account_id: a.accountId,
      person_id: a.personId ?? null,
      model: a.model,
      feature: a.feature,
      input_tokens: a.inputTokens,
      output_tokens: a.outputTokens,
      success: a.success,
      error: a.error ?? null,
    });
  } catch (e) {
    console.error('[ai_usage_log] insert failed (non-fatal):', e);
  }
}

type CommonArgs = {
  model: string;
  feature: AiFeature;
  accountId: string | null;
  personId?: string | null;
  system?: string;
  messages: any[];
  max_tokens: number;
};

// ---- Non-streaming call ----------------------------------------------------
// Mirrors the existing raw fetch. Returns the parsed Anthropic response object
// (so callers keep using data.content[0].text). Logs usage from data.usage.
// Transient HTTP statuses worth retrying (rate limit, overloaded, gateway/server
// blips). 4xx other than 429 are NOT retried — they won't succeed on retry.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const MAX_ATTEMPTS = 4;

function backoffMs(attempt: number): number {
  // 0.5s, 1s, 2s (+ up to 250ms jitter) before attempts 2, 3, 4.
  const base = 500 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * 250);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function aiMessage(args: CommonArgs): Promise<{ ok: boolean; status: number; data?: any; errorText?: string }> {
  const { model, feature, accountId, personId, system, messages, max_tokens } = args;

  let lastErrorText = 'AI request failed';
  let lastStatus = 500;

  // Retry transient failures (network errors + 429/5xx/529). A single overloaded
  // or rate-limited response no longer surfaces as a user-facing error — the most
  // common cause of intermittent "AI parsing failed" / lost ingredients on save.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens, ...(system ? { system } : {}), messages }),
      });
    } catch (e: any) {
      // Network/transport error — retry if attempts remain.
      lastErrorText = e?.message ?? 'fetch failed';
      lastStatus = 500;
      if (attempt < MAX_ATTEMPTS) { await sleep(backoffMs(attempt)); continue; }
      void logAiUsage({ accountId, personId, model, feature, inputTokens: 0, outputTokens: 0, success: false, error: `${lastErrorText} (after ${attempt} attempts)` });
      return { ok: false, status: lastStatus, errorText: lastErrorText };
    }

    if (!res.ok) {
      const errorText = await res.text();
      lastErrorText = errorText;
      lastStatus = res.status;
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      void logAiUsage({ accountId, personId, model, feature, inputTokens: 0, outputTokens: 0, success: false, error: errorText.slice(0, 500) });
      return { ok: false, status: res.status, errorText };
    }

    const data = await res.json();
    const usage = data?.usage ?? {};
    void logAiUsage({
      accountId, personId, model, feature,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      success: true,
    });
    return { ok: true, status: 200, data };
  }

  // Exhausted all attempts on retryable failures.
  void logAiUsage({ accountId, personId, model, feature, inputTokens: 0, outputTokens: 0, success: false, error: `${String(lastErrorText).slice(0, 480)} (after ${MAX_ATTEMPTS} attempts)` });
  return { ok: false, status: lastStatus, errorText: lastErrorText };
}

// ---- Streaming call --------------------------------------------------------
// Returns the raw upstream Response so the caller can pipe/transform the SSE
// stream exactly as before. Usage is captured by passing the parsed events
// through `captureStreamUsage` (see below) inside the caller's existing loop —
// OR, simpler, the caller invokes `aiStreamStart` and then calls
// `logStreamUsage` once it has read the message_start + message_delta events.
//
// To keep the caller's stream logic untouched, we expose a tiny usage collector
// the caller feeds each parsed event into; it logs once on message_stop.
export async function aiStreamStart(args: CommonArgs): Promise<{ ok: boolean; status: number; res?: Response; errorText?: string }> {
  const { model, feature, accountId, personId, system, messages, max_tokens } = args;
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, ...(system ? { system } : {}), messages, stream: true }),
    });
  } catch (e: any) {
    void logAiUsage({ accountId, personId, model, feature, inputTokens: 0, outputTokens: 0, success: false, error: e?.message ?? 'fetch failed' });
    return { ok: false, status: 500, errorText: e?.message ?? 'fetch failed' };
  }
  if (!res.ok) {
    const errorText = await res.text();
    void logAiUsage({ accountId, personId, model, feature, inputTokens: 0, outputTokens: 0, success: false, error: errorText.slice(0, 500) });
    return { ok: false, status: res.status, errorText };
  }
  return { ok: true, status: 200, res };
}

// A small stateful collector. Feed it each parsed SSE `event` object inside the
// caller's existing stream loop; it pulls usage from message_start / message_delta
// and logs once when the stream ends (call .finish()).
export function makeUsageCollector(meta: { model: string; feature: AiFeature; accountId: string | null; personId?: string | null }) {
  let inputTokens = 0;
  let outputTokens = 0;
  let logged = false;
  return {
    observe(event: any) {
      // message_start carries input_tokens (and initial output_tokens)
      if (event?.type === 'message_start' && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens ?? inputTokens;
        outputTokens = event.message.usage.output_tokens ?? outputTokens;
      }
      // message_delta carries cumulative output_tokens
      if (event?.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      }
    },
    finish(success = true, error?: string) {
      if (logged) return;
      logged = true;
      void logAiUsage({ ...meta, inputTokens, outputTokens, success, error: error ?? null });
    },
  };
}
