// src/app/api/ingredients/[slug]/route.ts
// Fetches ingredient data and lazily generates AI content if missing.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const params = context.params;
  const { slug } = await params;
  const supabase = await createClient();
  const db = supabase as any;

  // ── Fetch ingredient ─────────────────────────────────────────
  const { data: ing, error } = await db
    .from('ingredients')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !ing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Fetch recipes using this ingredient ──────────────────────
  const { data: vIngredients } = await db
    .from('version_ingredients')
    .select('version_id')
    .eq('ingredient_id', ing.id)
    .limit(20);

  let linkedRecipes: any[] = [];
  const recipeCount = (vIngredients ?? []).length;

  if (vIngredients?.length) {
    const versionIds = vIngredients.map((v: any) => v.version_id);
    const { data: versions } = await db
      .from('recipe_versions')
      .select('id, title, canonical_id')
      .in('id', versionIds);

    if (versions?.length) {
      const canonicalIds = [...new Set(versions.map((v: any) => v.canonical_id))];
      const { data: canonicals } = await db
        .from('recipe_canonicals')
        .select('id, slug, is_published')
        .in('id', canonicalIds)
        .eq('is_published', true);

      if (canonicals?.length) {
        linkedRecipes = canonicals.map((rc: any) => {
          const v = versions.find((v: any) => v.canonical_id === rc.id);
          return { id: rc.id, slug: rc.slug, title: v?.title ?? '(untitled)' };
        });
      }
    }
  }

  // ── Fetch siblings (same parent) ─────────────────────────────
  let siblings: any[] = [];
  const parentId = ing.parent_id ?? ing.transformed_from_id;
  if (parentId) {
    const { data: sibs } = await db
      .from('ingredients')
      .select('id, slug, name')
      .eq('parent_id', parentId)
      .neq('id', ing.id)
      .limit(12);
    siblings = sibs ?? [];
  }

  // ── Fetch parent ─────────────────────────────────────────────
  let parent: any = null;
  if (parentId) {
    const { data: p } = await db
      .from('ingredients')
      .select('id, slug, name')
      .eq('id', parentId)
      .single();
    parent = p ?? null;
  }

  // ── Fetch children (varieties) ───────────────────────────────
  const { data: children } = await db
    .from('ingredients')
    .select('id, slug, name')
    .eq('parent_id', ing.id)
    .limit(20);

  // ── Composition: ingredients derived FROM this one ───────────
  // The inverse of transformed_from_id — pulp, juice, zest, etc. that start as
  // part of this ingredient and become their own ingredient via a process.
  // Each entry carries preview fields so the section can render preview cards.
  const { data: compRows } = await db
    .from('ingredients')
    .select('id, slug, name, short_description, summary, image_url, transformation_recipe_id')
    .eq('transformed_from_id', ing.id)
    .order('name', { ascending: true })
    .limit(40);
  const composition = (compRows ?? []).map((c: any) => ({
    id: c.id, slug: c.slug, name: c.name,
    blurb: c.short_description || c.summary || null,
    imageUrl: c.image_url || null,
    hasRecipe: !!c.transformation_recipe_id,
  }));

  // ── Fetch content sub-sections (Storing/Production/History/…) ─
  const { data: sectionRows } = await db
    .from('content_sections')
    .select('id, section_key, sort_order, headline, image_url, image_credit, body, bullets')
    .eq('entity_type', 'ingredient')
    .eq('entity_id', ing.id)
    .order('sort_order', { ascending: true });
  const sections: Record<string, any[]> = {};
  for (const row of (sectionRows ?? [])) {
    (sections[row.section_key] ??= []).push(row);
  }

  // ── Fetch concepts (global name bindings) for this ingredient ─
  const { data: cmRows } = await db
    .from('concept_member')
    .select('id, position, concept:concept_id ( id, name, note )')
    .eq('entity_type', 'ingredient')
    .eq('entity_id', ing.id)
    .order('position', { ascending: true });
  const concepts = (cmRows ?? []).map((m: any) => {
    const c = Array.isArray(m.concept) ? m.concept[0] : m.concept;
    return { memberId: m.id, conceptId: c?.id, name: c?.name, note: c?.note ?? null };
  }).filter((c: any) => c.conceptId);

  // ── Fetch transformation recipe ──────────────────────────────
  let transformationRecipe: any = null;
  if (ing.transformation_recipe_id) {
    const { data: tr } = await db
      .from('recipe_versions')
      .select(`
        id, title,
        recipe_canonicals!canonical_id ( id, slug, is_published )
      `)
      .eq('id', ing.transformation_recipe_id)
      .single();
    if (tr) {
      const rc = Array.isArray(tr.recipe_canonicals)
        ? tr.recipe_canonicals[0]
        : tr.recipe_canonicals;
      if (rc?.is_published) {
        transformationRecipe = { title: tr.title, slug: rc.slug };
      }
    }
  }

  // ── Lazy AI content generation ───────────────────────────────
  const needsAiContent = !ing.summary && !ing.ai_content_generated_at;

  if (needsAiContent) {
    // Fire and forget — don't block the response
    generateAndCacheAiContent(ing, db).catch(console.error);
  }

  return NextResponse.json({
    ingredient: {
      ...ing,
      recipeCount:          recipeCount ?? 0,
      linkedRecipes,
      parent,
      siblings,
      children:             children ?? [],
      composition,
      concepts,
      sections,
      transformationRecipe,
      needsAiContent,
    },
  });
}

async function generateAndCacheAiContent(ing: any, db: any) {
  const prompt = `You are a food knowledge system. Generate structured content for the ingredient/food entity: "${ing.name}".

Respond with ONLY a JSON object (no markdown, no backticks) with these fields:
{
  "summary": "2-3 sentences: what it is, key characteristics, common culinary role",
  "taste_profile": "1-2 sentences: taste, texture, aroma",
  "uses": ["list", "of", "3-8", "common", "culinary", "uses"],
  "history": "2-4 sentences: origin, key historical facts, cultural significance",
  "manufacturing_notes": "1-3 sentences: how it is grown, produced, or processed. null if not applicable",
  "cultural_notes": "1-2 sentences: notable regional or cultural significance. null if not applicable",
  "is_vegan": true or false,
  "is_vegetarian": true or false,
  "is_halal": true or false or null,
  "is_kosher": true or false or null,
  "is_gluten_free": true or false
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.find((c: any) => c.type === 'text')?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    await db.from('ingredients').update({
      summary:              parsed.summary        ?? null,
      taste_profile:        parsed.taste_profile  ?? null,
      uses:                 parsed.uses           ?? null,
      history:              parsed.history        ?? null,
      manufacturing_notes:  parsed.manufacturing_notes ?? null,
      cultural_notes:       parsed.cultural_notes ?? null,
      is_vegan:             parsed.is_vegan       ?? null,
      is_vegetarian:        parsed.is_vegetarian  ?? null,
      is_halal:             parsed.is_halal       ?? null,
      is_kosher:            parsed.is_kosher      ?? null,
      is_gluten_free:       parsed.is_gluten_free ?? null,
      ai_content_generated_at: new Date().toISOString(),
      content_reviewed:     false,
    }).eq('id', ing.id);

  } catch (err) {
    console.error('[AI ingredient content]', err);
  }
}
