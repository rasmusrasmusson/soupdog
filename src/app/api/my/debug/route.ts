// src/app/api/my/debug/route.ts  — TEMPORARY diagnostic. Delete after use.
// Reports what role the DB sees and whether auth.uid() resolves, then tries
// the exact person insert and returns the raw error.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = supabase as any;

  const out: any = { node_user_id: user?.id ?? null, node_email: user?.email ?? null };

  // What does the DB session see? (rpc to a tiny inline function via select)
  const { data: who, error: whoErr } = await db.rpc('debug_whoami');
  out.db_whoami = who ?? null;
  out.db_whoami_error = whoErr?.message ?? null;

  // Try the actual insert the app does, capture raw error.
  const { data: ins, error: insErr } = await db
    .from('person')
    .insert({ display_name: 'DEBUG_DELETE_ME', is_managed: true, residency_region: 'global' })
    .select('id')
    .single();
  out.insert_ok = !!ins;
  out.insert_id = ins?.id ?? null;
  out.insert_error = insErr ? { message: insErr.message, code: insErr.code, details: insErr.details, hint: insErr.hint } : null;

  // clean up if it somehow succeeded
  if (ins?.id) await db.from('person').delete().eq('id', ins.id);

  return NextResponse.json(out);
}
