'use client';
import { Search } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sampleRecipes } from '@/data/sample-recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { searchRecipes } from '@/lib/search';

const TYPES = ['All', 'Recipes', 'Ingredients', 'Techniques', 'Equipment'] as const;

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [contentType, setContentType] = useState<typeof TYPES[number]>('All');

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
    setContentType((searchParams.get('type') as typeof TYPES[number]) ?? 'All');
  }, [searchParams]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const params = new URLSearchParams();
    if (value) params.set('q', value);
    if (contentType !== 'All') params.set('type', contentType);
    router.push(`/search${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  const handleTypeChange = (type: typeof TYPES[number]) => {
    setContentType(type);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type !== 'All') params.set('type', type);
    router.push(`/search${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  let results = searchRecipes(sampleRecipes, query);

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
            disabled={type !== 'All' && type !== 'Recipes'}
            className={`text-xs px-3 py-1.5 border rounded-sm transition-colors ${
              contentType === type
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : type !== 'All' && type !== 'Recipes'
                  ? 'border-[var(--border)] text-[var(--muted)] cursor-not-allowed opacity-50'
                  : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <>
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {results.length} {results.length === 1 ? 'Result' : 'Results'}
            </h2>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {results.map(r => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="font-mono text-[12px] text-[var(--muted)] uppercase tracking-widest">
            {query ? 'No recipes found' : 'Enter a search query'}
          </p>
        </div>
      )}
    </div>
  );
}
