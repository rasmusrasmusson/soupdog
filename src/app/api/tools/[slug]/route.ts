// src/app/api/tools/[slug]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/tools/[slug]
// Returns one equipment row (the "tool"), its concept relations (parent / siblings /
// child models), and the techniques it performs (reverse lookup: verified tasks whose
// suggested_tool_slugs array contains this tool's slug).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = (await createClient()) as any;

  // ── The tool itself ───────────────────────────────────────────
  const { data: tool, error } = await supabase
    .from('equipment')
    .select(`
      id, slug, name, category, description, summary, description_long,
      brand, model_number, manufacturer, connected, wattage,
      cavity_volume_litres, uses, image_url, image_credit,
      content_reviewed, source, parent_id, capability_schema
    `)
    .eq('slug', slug)
    .maybeSingle();

  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tool)  return NextResponse.json({ error: 'Tool not found.' }, { status: 404 });

  // ── Concept relations (parent / siblings / child models) ──────
  let parent: any = null;
  let siblings: any[] = [];
  let children: any[] = [];

  if (tool.parent_id) {
    const { data: p } = await supabase
      .from('equipment')
      .select('id, slug, name, brand')
      .eq('id', tool.parent_id)
      .maybeSingle();
    parent = p ?? null;

    const { data: sib } = await supabase
      .from('equipment')
      .select('id, slug, name, brand')
      .eq('parent_id', tool.parent_id)
      .neq('id', tool.id)
      .order('name');
    siblings = sib ?? [];
  }

  // Child models — equipment rows whose parent_id is this tool (the concept page).
  const { data: kids } = await supabase
    .from('equipment')
    .select('id, slug, name, brand, model_number, wattage, connected')
    .eq('parent_id', tool.id)
    .order('name');
  children = kids ?? [];

  // ── Techniques this tool performs (reverse lookup) ────────────
  // tasks.suggested_tool_slugs is a jsonb array of slugs; find verified tasks
  // that list this tool's slug. Using the `cs` (contains) operator on the jsonb.
  let techniques: { slug: string; name: string }[] = [];
  {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('slug, name, suggested_tool_slugs, is_verified')
      .eq('is_verified', true)
      .contains('suggested_tool_slugs', JSON.stringify([tool.slug]))
      .order('name');
    // Defensive: also filter client-side in case the DB operator is loose.
    techniques = (tasks ?? [])
      .filter((t: any) => Array.isArray(t.suggested_tool_slugs)
        ? t.suggested_tool_slugs.includes(tool.slug)
        : true)
      .map((t: any) => ({ slug: t.slug, name: t.name }));
  }

  return NextResponse.json({
    tool: { ...tool, parent, siblings, children, techniques },
  });
}
