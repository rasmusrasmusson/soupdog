// src/app/api/my/requirement/route.ts
// Demand Model · Phase 1 · inspect the resolved requirement for the caller's
// self-person. Read-only. Returns each field with its rung + confidence so the
// cascade is visible end to end. (Per-occasion shares and table aggregation
// come in later slices; this exposes the daily requirement resolver.)

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRequirement } from '@/lib/demand/resolve-requirement';

async function selfPersonId(db: any, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();
  return data?.person_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const pid = await selfPersonId(db, user.id);
  if (!pid) return NextResponse.json({ error: 'No self-person found' }, { status: 404 });

  const requirement = await resolveRequirement(db, pid);
  return NextResponse.json({ requirement });
}
