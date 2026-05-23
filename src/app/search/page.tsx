import { Search } from 'lucide-react';
import { sampleRecipes } from '@/data/sample-recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <h1 className="font-display text-4xl font-light mb-8">Search</h1>

      {/* Search input */}
      <div className="flex items-center gap-3 border border-[var(--border)] rounded-sm px-4 py-3 mb-3 focus-within:border-[var(--accent)] transition-colors">
        <Search size={16} strokeWidth={1.5} className="text-[var(--muted)]" />
        <input
          autoFocus
          placeholder="Search recipes, ingredients, techniques, equipment…"
          className="flex-1 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
        />
        <kbd className="text-[10px] font-mono border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--muted)]">ESC</kbd>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 mb-10">
        {['All', 'Recipes', 'Ingredients', 'Techniques', 'Equipment'].map((f, i) => (
          <button key={f} className={`text-xs px-3 py-1.5 border rounded-sm transition-colors ${i === 0 ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">Featured</h2>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {sampleRecipes.map(r => <RecipeCard key={r.id} recipe={r} />)}
      </div>
    </div>
  );
}
