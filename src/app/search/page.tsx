'use client';

import { Search } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

const TYPES = ['All', 'Recipes', 'Ingredients', 'Techniques', 'Equipment'] as const;
type ContentType = typeof TYPES[number];

// Map UI type labels to search_index type values
const TYPE_MAP: Record<ContentType, string | null> = {
  All:        null,
  Recipes:    'recipe',
  Ingredients:'ingredient',
  Techniques: 'technique',
  Equipment:  'equipment',
};

interface SearchResult {
  id:    string;
  slug:  string;
  type:  string;
  title: string;
}

export default function SearchPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();

  const [query,       setQuery]       = useState('');
  const [contentType, setContentType] = useState<ContentType>('Recipes');
  const [results,     setResults]     = useState<SearchResult[]>([]);
  const [loading,     setLoading]     = useState(false);

  // Sync state from URL params on load
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
    setContentType((searchParams.get('type') as ContentType) ?? 'Recipes');
  }, [searchParams]);

  // Run search against Supabase search_index
  const runSearch = useCallback(async (q: string, type: ContentType) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      let db = (supabase as any)
        .from('search_index')
        .select('id, slug, type, title')
        .textSearch('tsv', q, { type: 'websearch', config: 'english' })
        .limit(50);

      const mapped = TYPE_MAP[type];
      if (mapped) db = db.eq('type', mapped);

      const { data, error } = await db;
      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-run search whenever query or type changes
  useEffect(() => {
    runSearch(query, contentType);
  }, [query, contentType, runSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const params = new URLSearchParams();
    if (value) params.set('q', value);
    if (contentType !== 'All') params.set('type', contentType);
    router.push(`/search${params.size > 0 ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  const handleTypeChange = (type: ContentType) => {
    setContentType(type);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type !== 'All') params.set('type', type);
    router.push(`/search${params.size > 0 ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  // URL for a result based on its type
  const resultUrl = (r: SearchResult) => {
    switch (r.type) {
      case 'recipe':     return `/recipes/${r.slug}`;
      case 'ingredient': return `/ingredients/${r.slug}`;
      case 'technique':  return `/techniques/${r.slug}`;
      case 'equipment':  return `/equipment/${r.slug}`;
      default:           return `/${r.slug}`;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <h1 className="font-display text-4xl font-light mb-8">Search</h1>

      {/* Search input */}
      <div className="flex items-center gap-3 border border-[var(--border)] rounded-sm px-4 py-3 mb-3 focus-within:border-[var(--accent)] transition-colors">
        <Search size={16} strokeWidth={1.5} className="text-[var(--muted)]" />
        <input
          autoFocus
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Search recipes, ingredients, techniques, equipment…"
          className="flex-1 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
        />
        <kbd className="text-[10px] font-mono border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--muted)]">ESC</kbd>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 mb-10 flex-wrap">
        {TYPES.map((type) => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            className={`text-xs px-3 py-1.5 border rounded-sm transition-colors ${
              contentType === type
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="py-12 text-center">
          <p className="font-mono text-[12px] text-[var(--muted)] uppercase tracking-widest">
            Searching…
          </p>
        </div>
      ) : results.length > 0 ? (
        <>
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {results.length} {results.length === 1 ? 'Result' : 'Results'}
            </h2>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <table className="w-full text-sm border-collapse">
            <tbody>
              {results.map(r => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={resultUrl(r)}
                      className="font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="py-3 text-right">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                      {r.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="font-mono text-[12px] text-[var(--muted)] uppercase tracking-widest">
            {query ? 'No results found' : 'Enter a search query'}
          </p>
        </div>
      )}
    </div>
  );
}
