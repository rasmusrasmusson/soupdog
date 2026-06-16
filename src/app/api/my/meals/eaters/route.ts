// src/app/api/my/meals/[id]/eaters/route.ts
//
// GET /api/my/meals/[id]/eaters → who's eating this meal, with names + avatars.
// Reads meal_participant for the meal and resolves person details. Used by the
// cook-setup page's "Who's eating" section. Self-contained, read-only.
//
// A meal may legitimately have zero eaters (e.g. a restaurant doesn't know its
// diners) — that's a valid, empty result, not an error.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const db = supabase as any;

  const { data: parts } = await db
    .from('meal_participant')
    .select('person_id, status')
    .eq('meal_id', id);

  const personIds = Array.from(new Set((parts ?? []).map((p: any) => p.person_id).filter(Boolean)));
  const eaters: any[] = [];
  if (personIds.length) {
    const { data: people } = await db
      .from('person')
      .select('id, full_name, display_name, avatar_color, avatar_initials')
      .in('id', personIds);
    const byId: Record<string, any> = {};
    for (const p of people ?? []) byId[p.id] = p;
    for (const part of parts ?? []) {
      const p = byId[part.person_id];
      if (!p) continue;
      eaters.push({
        id: p.id,
        name: p.full_name || p.display_name || 'Someone',
        avatarColor: p.avatar_color ?? null,
        avatarInitials: p.avatar_initials ?? null,
        status: part.status,
      });
    }
  }

  return NextResponse.json({ eaters });
}
