import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  const type  = searchParams.get('type') || 'all'; // recipe | ingredient | technique | all

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();

  // Build the search_index query
  let db = (supabase as any)
    .from('search_index')
    .select('id, slug, type, title')
    .order('title');

  // Full-text search using the tsv column
  db = db.textSearch('tsv', query, {
    type: 'websearch',
    config: 'english',
  });

  // Filter by type if specified
  if (type !== 'all') {
    db = db.eq('type', type);
  }

  db = db.limit(50);

  const { data, error } = await db;

  if (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shape results to match what the frontend expects
  const results = (data || []).map((row: any) => ({
    id:    row.id,
    slug:  row.slug,
    type:  row.type,
    title: row.title,
  }));

  return NextResponse.json({ results });
}
