// src/app/api/admin/check/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// AUTH account ids (auth.uid()). Keep in sync with /api/admin/tasks/[id] + the RLS policy.
const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ isAdmin: !!user && ADMIN_IDS.includes(user.id) });
}
