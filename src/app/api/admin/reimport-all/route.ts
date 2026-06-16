// src/app/api/admin/reimport-all/route.ts
//
// Batch re-import. Lists eligible recipe canonicals and re-decomposes each one in
// place by calling the single-recipe route (/api/admin/reimport-recipe) server-to-
// server, SEQUENTIALLY (decompose is an AI call — sequential avoids rate-limit
// storms and keeps cost legible). Per-recipe errors are captured, never abort the
// whole run.
//
// Skips:
//   - meals (composition_level = 'meal') — a meal's "recipe" is a merged blob, not
//     its own version_steps; re-decomposing it would be meaningless.
//   - an explicit skip-list (products like the pizza, duplicate test recipes).
//
// POST { commit?: boolean, skipIds?: string[], onlyIds?: string[] }
//   commit=false (default) → DRY RUN per recipe (decompose, count, write nothing).
//   commit=true            → commit each.
//   onlyIds                → restrict to these canonical ids (else all eligible).
//   skipIds                → additional ids to skip (merged with the built-in list).
//
// Admin-gated.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300; // batch of AI calls — needs headroom

const ADMIN_ACCOUNT_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_ADMINS = [
  'bb02ae50-436c-4402-8c8c-447344e10151',
  '1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf',
];
function isAdmin(accountId: string): boolean {
  const allow = ADMIN_ACCOUNT_IDS.length ? ADMIN_ACCOUNT_IDS : DEFAULT_ADMINS;
  return allow.includes(accountId);
}

// Built-in skip list: the Dr Oetker pizza (a product, not cooked) and the duplicate
// "Spaghetti Carbonara" test rows. (The meal is skipped via composition_level.)
const BUILTIN_SKIP = new Set<string>([
  '4f3f92af-a120-4de4-877d-46f531dd4af7', // Dr Oetker Pepperoni pizza (product)
  'bbe17890-9f18-4a13-93f3-594d78bfcba8', // duplicate Spaghetti Carbonara (older)
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const commit: boolean = body.commit === true;
  const onlyIds: string[] | null = Array.isArray(body.onlyIds) ? body.onlyIds : null;
  const extraSkip: string[] = Array.isArray(body.skipIds) ? body.skipIds : [];
  const skip = new Set<string>([...BUILTIN_SKIP, ...extraSkip]);

  const db = supabase as any;

  // List eligible canonicals: not meals, not skipped, has a current version.
  const { data: canonicals, error } = await db
    .from('recipe_canonicals')
    .select('id, slug, composition_level, current_version_id')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let eligible = (canonicals ?? []).filter((c: any) =>
    c.composition_level !== 'meal' &&
    c.current_version_id &&
    !skip.has(c.id)
  );
  if (onlyIds) eligible = eligible.filter((c: any) => onlyIds.includes(c.id));

  // Re-import each, sequentially, via the single route (reuses all tested logic).
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';
  const results: any[] = [];

  for (const c of eligible) {
    try {
      const r = await fetch(`${origin}/api/admin/reimport-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ canonicalId: c.id, commit }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        results.push({ id: c.id, slug: c.slug, ok: false, error: j.error ?? `HTTP ${r.status}` });
      } else if (commit) {
        results.push({ id: c.id, slug: c.slug, ok: true, versionNumber: j.versionNumber, wrote: j.wrote });
      } else {
        results.push({ id: c.id, slug: c.slug, ok: true, before: j.before, after: j.after });
      }
    } catch (e: any) {
      results.push({ id: c.id, slug: c.slug, ok: false, error: e.message });
    }
  }

  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;
  return NextResponse.json({
    commit, total: results.length, ok: okCount, failed: failCount,
    skipped: (canonicals ?? []).length - eligible.length,
    results,
  });
}
