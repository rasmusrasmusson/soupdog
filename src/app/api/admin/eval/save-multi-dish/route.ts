// src/app/api/admin/eval/save-multi-dish/route.ts
//
// SAVE-SIDE verification for multi-dish decompose-save. Admin-only.
// Unlike the decompose harness (read-only), this WRITES — so it creates a recipe,
// reads back the two facts we care about (composition_level + version_sub_recipes
// rows), then DELETES it in FK-safe order. Self-cleaning. If cleanup fails, it
// returns the created canonicalId so nothing is silently orphaned.
//
// USAGE (admin, browser console):
//   fetch('/api/admin/eval/save-multi-dish', { method: 'POST' }).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)))
//
// It posts a hand-made multi-dish DAG (one inline dish "Side salad" + one linked
// existing dish) to /api/recipes/decompose-save, then verifies the DB.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// A real published dish to link (from the live list). If you delete it, change this.
const LINKED_SLUG = 'spaghetti-aglio-e-olio-mpw6yxsz';
const LINKED_NAME = 'Spaghetti aglio e olio';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';

  // A multi-dish DAG: one INLINE dish (Side salad, one dress node = its terminal)
  // + one LINKED existing dish (aglio e olio). Expect: composition_level='meal',
  // exactly 1 version_sub_recipes row pointing at LINKED_SLUG.
  const dag = {
    title: 'SAVE-TEST aglio e olio with side salad',
    servings: 4,
    nodes: [
      {
        id: 'n1', task: 'dress',
        ingredients: [{ name: 'salad leaves', qty: 100, unit: 'g', prep: null }],
        consumes: [], produces: 'Side salad', group: 'Side salad',
        tool: 'salad-bowl', params: {}, passive: false, completion: null, notes: null,
      },
    ],
    linkedDishes: [{ dishName: LINKED_NAME, canonicalSlug: LINKED_SLUG }],
  };

  const result: any = { steps: [] };
  let canonicalId: string | null = null;
  let versionId: string | null = null;

  try {
    // 1. SAVE
    const saveRes = await fetch(`${origin}/api/recipes/decompose-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ dag, meta: { title: dag.title, servings: 4 } }),
    });
    const saveText = await saveRes.text();
    if (!saveRes.ok) {
      result.saveError = `decompose-save ${saveRes.status}: ${saveText.slice(0, 400)}`;
      return NextResponse.json(result, { status: 200 });
    }
    let saved: any; try { saved = JSON.parse(saveText); } catch { saved = null; }
    canonicalId = saved?.canonicalId ?? saved?.id ?? saved?.canonical?.id ?? null;
    result.steps.push({ save: 'ok', canonicalId, raw: canonicalId ? undefined : saveText.slice(0, 300) });

    if (!canonicalId) {
      result.note = 'save ok but no canonicalId in response — cannot verify/cleanup; check decompose-save response shape';
      result.savedResponse = saved;
      return NextResponse.json(result, { status: 200 });
    }

    // 2. VERIFY composition_level
    const { data: canon } = await db.from('recipe_canonicals')
      .select('id, current_version_id, composition_level').eq('id', canonicalId).maybeSingle();
    versionId = canon?.current_version_id ?? null;
    result.compositionLevel = canon?.composition_level ?? null;
    result.compositionLevelPass = canon?.composition_level === 'meal';

    // 3. VERIFY version_sub_recipes
    const { data: subs } = await db.from('version_sub_recipes')
      .select('child_canonical_id, used_as_ingredient_label, child_version_id')
      .eq('parent_version_id', versionId);
    result.subRecipeCount = (subs ?? []).length;
    result.subRecipes = subs ?? [];
    // resolve the linked slug's canonical id to confirm the link points at it
    const { data: linkedCanon } = await db.from('recipe_canonicals').select('id').eq('slug', LINKED_SLUG).maybeSingle();
    result.subRecipePass = (subs ?? []).length === 1
      && !!linkedCanon
      && (subs ?? [])[0]?.child_canonical_id === linkedCanon.id;

    result.pass = result.compositionLevelPass && result.subRecipePass;

  } catch (e: any) {
    result.error = e?.message ?? String(e);
  } finally {
    // 4. CLEANUP — FK-safe teardown of the test recipe.
    if (canonicalId) {
      try {
        // fetch all version ids for this canonical
        const { data: versions } = await db.from('recipe_versions').select('id').eq('canonical_id', canonicalId);
        const vids: string[] = (versions ?? []).map((v: any) => v.id);
        for (const vid of vids) {
          // recipes mirror links via recipe_version_id (the real link)
          await db.from('recipes').delete().eq('recipe_version_id', vid);
          // step ids for this version
          const { data: steps } = await db.from('version_steps').select('id').eq('version_id', vid);
          const sids: string[] = (steps ?? []).map((s: any) => s.id);
          if (sids.length) {
            await db.from('version_step_dependencies').delete().in('step_id', sids);
            await db.from('version_step_dependencies').delete().in('depends_on_step_id', sids);
            await db.from('version_ingredients').delete().in('step_id', sids);
          }
          await db.from('version_sub_recipes').delete().eq('parent_version_id', vid);
          await db.from('version_steps').delete().eq('version_id', vid);
          await db.from('execution_variants').delete().eq('version_id', vid);
        }
        // null the canonical's current_version_id, then delete versions, then canonical
        await db.from('recipe_canonicals').update({ current_version_id: null }).eq('id', canonicalId);
        await db.from('recipe_versions').delete().eq('canonical_id', canonicalId);
        await db.from('recipe_canonicals').delete().eq('id', canonicalId);
        result.cleanup = 'ok';
      } catch (ce: any) {
        result.cleanup = `FAILED — orphan left, delete manually: canonicalId=${canonicalId} (${ce?.message ?? ce})`;
      }
    }
  }

  return NextResponse.json(result, { status: 200 });
}
