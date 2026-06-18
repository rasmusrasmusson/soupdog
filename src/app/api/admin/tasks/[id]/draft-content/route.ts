// src/app/api/admin/tasks/[id]/draft-content/route.ts
// Admin-only: drafts `tips` and `common_mistakes` for a task using the AI,
// following an authoring rubric. Returns the draft for REVIEW — it does NOT
// write to the DB. The edit page fills its form fields with the result; the
// admin edits and saves through the normal Save (system suggests, human decides).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// The authoring rubric — what a GOOD tip / common-mistake entry looks like.
// This is the "guardrail" that steers the draft (distinct from the decomposition
// guide, which steers task PICKING; this steers task-content WRITING).
const SYSTEM = `You write concise, practical content for a cooking technique reference.
For a given cooking TECHNIQUE (task), you draft two short fields:

"tips": 1-3 short, practical tips a cook would genuinely value. Concrete and
specific to THIS technique — not generic ("be careful", "use good ingredients").
Each tip one sentence. Plain, calm, expert tone. No preamble.

"common_mistakes": 1-3 specific mistakes people actually make with THIS technique,
and (briefly) the consequence or fix. One sentence each. Concrete, not obvious.

Rules:
- Be specific to the technique given. If it's "Sauté", talk about pan heat, not
  crowding, moving the food — not generic cooking advice.
- Do NOT restate the description. Add NEW, useful information.
- Keep it short. A cook skims this. No fluff, no marketing tone.
- If you are unsure about the technique or lack enough to say something useful,
  return an empty string for that field rather than inventing filler.
- Return ONLY a JSON object: {"tips": "...", "common_mistakes": "..."}.
  No markdown, no backticks, no commentary.`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // load the task's context to ground the draft
  const db = supabase as any;
  const { data: task, error } = await db.from('tasks')
    .select('name, description, category, completion_type, completion_target, completion_criterion, heat_mechanism, heat_medium, typical_input_state, typical_output_state, suggested_tool_slugs')
    .eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const tools = Array.isArray(task.suggested_tool_slugs) ? task.suggested_tool_slugs.join(', ') : '';
  const context = [
    `Technique: ${task.name}`,
    task.description ? `Description: ${task.description}` : '',
    task.category ? `Category: ${task.category}` : '',
    (task.heat_mechanism && task.heat_mechanism !== 'none')
      ? `Heat: ${task.heat_mechanism}${task.heat_medium && task.heat_medium !== 'none' ? ` in ${task.heat_medium}` : ''}` : '',
    task.completion_criterion ? `Done when: ${task.completion_criterion}`
      : task.completion_target ? `Done when: ${task.completion_target} (${task.completion_type ?? ''})` : '',
    (task.typical_input_state || task.typical_output_state)
      ? `Transforms: ${task.typical_input_state ?? '?'} → ${task.typical_output_state ?? '?'}` : '',
    tools ? `Typical tools: ${tools}` : '',
  ].filter(Boolean).join('\n');

  const result = await aiMessage({
    model: 'claude-haiku-4-5-20251001',
    feature: 'other',  // task content drafting; 'other' avoids touching the AiFeature union
    accountId: user.id,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Draft tips and common mistakes for this technique:\n\n${context}` }],
    max_tokens: 600,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.errorText || 'AI request failed' }, { status: 502 });
  }

  // parse the JSON out of the response (robust to stray wrapping)
  const text: string = result.data?.content?.[0]?.text ?? '';
  let parsed: { tips?: string; common_mistakes?: string } = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response', raw: text.slice(0, 400) }, { status: 502 });
  }

  return NextResponse.json({
    tips: (parsed.tips ?? '').trim(),
    common_mistakes: (parsed.common_mistakes ?? '').trim(),
  });
}
