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
  // tasks.suggested_tool_slugs holds the tool slugs a task uses. The DB-side
  // jsonb containment operator proved unreliable across column-type variants
  // (jsonb vs text[]), so we fetch the verified tasks (small set, ~30) and match
  // in JS, normalising the value to a string[] whether it arrives as an array,
  // a JSON string, or a Postgres array literal.
  let techniques: { slug: string; name: string }[] = [];
  {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('slug, name, suggested_tool_slugs')
      .eq('is_verified', true)
      .order('name');

    const toSlugList = (v: any): string[] => {
      if (v == null) return [];
      if (Array.isArray(v)) return v.map((s) => String(s).trim());
      if (typeof v === 'string') {
        const s = v.trim();
        try { const p = JSON.parse(s); if (Array.isArray(p)) return p.map((x) => String(x).trim()); } catch {}
        // Postgres array literal fallback: {a,b,c}
        return s.replace(/^[{[]|[}\]]$/g, '').split(',')
          .map((x) => x.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
      }
      return [];
    };

    techniques = (tasks ?? [])
      .filter((t: any) => toSlugList(t.suggested_tool_slugs).includes(tool.slug))
      .map((t: any) => ({ slug: t.slug, name: t.name }));
  }

  return NextResponse.json({
    tool: { ...tool, parent, siblings, children, techniques },
  });
}
