// src/app/api/admin/nutrition/auto-match/route.ts
// Admin-only. Processes a BATCH of unmatched real ingredients:
//   USDA search → Haiku picks best candidate + confidence → guardrails →
//   high-confidence + safe  → import (prefer SR Legacy for coverage) + auto_matched
//   low-confidence / unsafe → needs_review (queued to the worklist for a human)
// Batched (default 20) so it never times out. Loop the button to drain.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';
import { serviceClient, usdaSearch, importFdcNutrition, looksLikeBlend, normalizeIngredientName, UsdaCandidate } from '@/lib/nutrition/usda';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

const HAIKU = 'claude-haiku-4-5-20251001';

// Pick the SR-Legacy candidate matching a chosen fdcId's food, if a broader one
// exists — prefer coverage. Here we simply prefer the chosen fdcId; the AI is
// instructed to favour SR Legacy. (Stacking Foundation is a later enhancement.)

type Pick = { fdcId: string | null; confidence: 'high' | 'low'; reason: string };

async function aiPick(
  ingredientName: string,
  candidates: UsdaCandidate[],
  accountId: string | null
): Promise<Pick | null> {
  // Show the AI only safe-ish candidates (drop obvious blends up front).
  const safe = candidates.filter(c => !looksLikeBlend(c.description));
  const pool = (safe.length ? safe : candidates).slice(0, 12);
  if (pool.length === 0) return { fdcId: null, confidence: 'low', reason: 'no candidates' };

  const list = pool.map((c, i) =>
    `${i + 1}. fdcId=${c.fdcId} | ${c.description} | ${c.dataType} | ` +
    `${c.markers.kcal ?? '?'}kcal ${c.markers.fat ?? '?'}g fat ${c.markers.protein ?? '?'}g protein`
  ).join('\n');

  const system =
    `You match a cooking ingredient to the best USDA FoodData Central food for its ` +
    `per-100g nutrition. Pick the candidate that is the PLAIN / RAW / most basic form of ` +
    `the ingredient. USDA names plain foods with commas and qualifiers ("Cucumber, with ` +
    `peel, raw"; "Egg, whole, raw, fresh"; "Beans, snap, green, raw") — these ARE the right ` +
    `plain matches, do not avoid them. Only AVOID candidates that are clearly a DIFFERENT ` +
    `food or a prepared/sweetened dessert product (pie, juice, jam, croissant, candied). ` +
    `For a common food (vegetable, fruit, meat, egg, dairy, grain, spice), there is almost ` +
    `always an obvious plain match in the list — choose it with confidence "high". ` +
    `Only return fdcId null + confidence "low" when NO candidate is the same food at all ` +
    `(e.g. an obscure non-US ingredient with no USDA entry). ` +
    `Reply ONLY with JSON: {"fdcId": "<id or null>", "confidence": "high"|"low", "reason": "<short>"}.`;

  const user = `Ingredient: "${ingredientName}"\n\nCandidates:\n${list}`;

  const r = await aiMessage({
    model: HAIKU, feature: 'nutrition_match', accountId,
    system, messages: [{ role: 'user', content: user }], max_tokens: 300,
  });
  if (!r.ok || !r.data) return null;

  const text = (r.data.content ?? []).map((b: any) => b.text ?? '').join('');
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const fdcId = parsed.fdcId && String(parsed.fdcId).toLowerCase() !== 'null'
      ? String(parsed.fdcId) : null;
    const confidence = parsed.confidence === 'high' ? 'high' : 'low';
    return { fdcId, confidence, reason: String(parsed.reason ?? '').slice(0, 200) };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  if (!process.env.USDA_FDC_API_KEY) {
    return NextResponse.json({ error: 'USDA_FDC_API_KEY is not set.' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 20, 1), 30);
  const accountId = user.id;

  const db = serviceClient() as any;

  // Next batch of UNMATCHED, real (non-product, non-category) ingredients.
  const { data: targets, error: tErr } = await db
    .from('ingredients')
    .select('id, name')
    .eq('nutrition_match_status', 'unmatched')
    .eq('is_product', false)
    .eq('is_category', false)
    .order('name', { ascending: true })
    .limit(batchSize);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const results: any[] = [];
  let imported = 0, flagged = 0;

  for (const ing of (targets ?? [])) {
    let candidates: UsdaCandidate[] = [];
    try {
      // Try a cleaned query first (strips slashes/qualifiers), then the raw
      // name if that yields nothing.
      const cleaned = normalizeIngredientName(ing.name);
      candidates = await usdaSearch(cleaned);
      if (candidates.length === 0 && cleaned !== ing.name.toLowerCase().trim()) {
        candidates = await usdaSearch(ing.name);
      }
    } catch (e: any) {
      // USDA search failed — flag for review rather than leaving it 'unmatched'
      // (else it retries forever on names USDA may never have).
      await db.from('ingredients')
        .update({ nutrition_match_status: 'needs_review' }).eq('id', ing.id);
      flagged++;
      results.push({ name: ing.name, outcome: 'needs_review', detail: `search error: ${e?.message ?? 'failed'}` });
      continue;
    }

    // No candidates at all (common for non-US ingredients) — flag, don't retry.
    if (candidates.length === 0) {
      await db.from('ingredients')
        .update({ nutrition_match_status: 'needs_review' }).eq('id', ing.id);
      flagged++;
      results.push({ name: ing.name, outcome: 'needs_review', detail: 'no USDA candidates' });
      continue;
    }

    const pick = await aiPick(ing.name, candidates, accountId);

    // Guardrails: must have a pick, high confidence, and the chosen food must
    // exist in the candidate set and NOT look like a blend.
    const chosen = pick?.fdcId
      ? candidates.find(c => c.fdcId === pick.fdcId)
      : undefined;
    const safe = chosen && !looksLikeBlend(chosen.description);
    const autoOk = pick && pick.confidence === 'high' && chosen && safe;

    if (autoOk) {
      const imp = await importFdcNutrition(db, ing.id, pick!.fdcId!);
      if (imp.ok) {
        await db.from('ingredients')
          .update({ nutrition_match_status: 'auto_matched' }).eq('id', ing.id);
        imported++;
        results.push({ name: ing.name, outcome: 'auto_matched',
          fdcId: pick!.fdcId, description: imp.description, grade: imp.grade,
          nutrients: imp.nutrientsImported });
      } else {
        await db.from('ingredients')
          .update({ nutrition_match_status: 'needs_review' }).eq('id', ing.id);
        flagged++;
        results.push({ name: ing.name, outcome: 'needs_review', detail: imp.error });
      }
    } else {
      await db.from('ingredients')
        .update({ nutrition_match_status: 'needs_review' }).eq('id', ing.id);
      flagged++;
      results.push({ name: ing.name, outcome: 'needs_review',
        detail: pick?.reason ?? 'no confident clean match',
        suggestion: pick?.fdcId ?? null });
    }
  }

  // How many unmatched remain (for the loop button).
  const { count: remaining } = await db
    .from('ingredients')
    .select('id', { count: 'exact', head: true })
    .eq('nutrition_match_status', 'unmatched')
    .eq('is_product', false)
    .eq('is_category', false);

  return NextResponse.json({
    processed: (targets ?? []).length,
    imported, flagged,
    remaining: remaining ?? 0,
    results,
  });
}
