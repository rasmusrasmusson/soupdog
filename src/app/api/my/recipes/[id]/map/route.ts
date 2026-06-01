// src/app/api/my/recipes/[id]/map/route.ts
// Read-only. Food Model content-map graph for a recipe:
// ingredients (with culinary roles + evidence) -> transformation steps -> dish.
// No writes. Mirrors the auth + nested-select pattern of the sibling [id]/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function evidenceBucket(grade: string | null): 'good' | 'inferred' | 'flagged' {
  if (!grade) return 'inferred';
  if (grade === 'e0_inferred') return 'inferred';
  if (grade.startsWith('e1') || grade.startsWith('e2') || grade.startsWith('e3') || grade.startsWith('e4')) return 'good';
  return 'inferred';
}

// GET /api/my/recipes/[id]/map
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = supabase as any;

  const { data, error } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug,
      recipe_versions!current_version_id (
        id, title, base_servings,
        version_steps (
          id, order_index, step_type, group_label, instruction
        ),
        version_ingredients (
          id, order_index, quantity_value, quantity_unit, step_id,
          ingredients!ingredient_id (
            id, name, category, nutrition_per_100g
          )
        )
      )
    `)
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rv = Array.isArray(data.recipe_versions) ? data.recipe_versions[0] : data.recipe_versions;
  const vIngs = rv?.version_ingredients ?? [];

  const ingredientIds = vIngs.map((vi: any) => vi.ingredients?.id).filter(Boolean);
  const rolesByIng: Record<string, { slug: string; grade: string }[]> = {};
  if (ingredientIds.length) {
    const { data: roleRows } = await db
      .from('ingredient_roles')
      .select('ingredient_id, evidence_grade, culinary_roles ( slug )')
      .in('ingredient_id', ingredientIds);
    for (const r of roleRows ?? []) {
      // Supabase may return the embedded relation as an object OR a 1-element array.
      const cr = Array.isArray(r.culinary_roles) ? r.culinary_roles[0] : r.culinary_roles;
      const slug = cr?.slug;
      if (slug) (rolesByIng[r.ingredient_id] ??= []).push({ slug, grade: r.evidence_grade });
    }
  }

  const ingredients = vIngs
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((vi: any) => {
      const ing = vi.ingredients;
      const roles = rolesByIng[ing?.id] ?? [];
      const roleGrade = roles.map((x) => x.grade).sort().reverse()[0] ?? null;
      const grade = roleGrade ?? (ing?.nutrition_per_100g ? 'e1_literature' : 'e0_inferred');
      return {
        name: ing?.name ?? 'unknown',
        category: ing?.category ?? 'other',
        quantity: `${vi.quantity_value ?? ''} ${vi.quantity_unit ?? ''}`.trim(),
        stepId: vi.step_id ?? null,
        roles: roles.map((x) => x.slug).filter(Boolean),
        evidence: grade,
        bucket: evidenceBucket(grade),
      };
    });

  const steps = (rv?.version_steps ?? [])
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s: any) => ({
      id: s.id,
      order: s.order_index,
      type: s.step_type,
      label: (s.group_label && s.group_label !== '__default__') ? s.group_label : s.step_type,
    }));

  return NextResponse.json({
    recipe: { id: data.id, slug: data.slug, title: rv?.title ?? '', servings: rv?.base_servings ?? 4 },
    ingredients,
    steps,
  });
}
