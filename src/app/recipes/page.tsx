import { RecipeCard } from '@/components/recipe/RecipeCard';
import { sampleRecipes } from '@/data/sample-recipes';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Recipes' };

const DIFFICULTY_FILTERS = ['All', 'Easy', 'Medium', 'Hard', 'Expert'];
const CUISINE_FILTERS = ['All', 'Indian', 'European', 'Asian', 'American', 'Middle Eastern'];

export default function RecipesPage() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-12">
      <header className="mb-10">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">Recipe Index</p>
        <h1 className="font-display text-4xl font-light text-[var(--fg)] mb-3">Recipes</h1>
        <p className="text-sm text-[var(--muted)] max-w-lg">
          Structured execution graphs for home cooks, professional kitchens, and connected appliances. Every recipe is versioned and linked to its ingredients and equipment.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-8 space-y-3">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)] mr-3">Difficulty</span>
          <div className="inline-flex gap-1 mt-1">
            {DIFFICULTY_FILTERS.map(f => (
              <button key={f} className="text-xs px-3 py-1 border border-[var(--border)] rounded-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors first:bg-[var(--accent)] first:text-white first:border-[var(--accent)]">
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)] mr-3">Cuisine</span>
          <div className="inline-flex flex-wrap gap-1 mt-1">
            {CUISINE_FILTERS.map(f => (
              <button key={f} className="text-xs px-3 py-1 border border-[var(--border)] rounded-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors first:bg-[var(--surface-hover)] first:text-[var(--fg)]">
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 text-[10px] font-mono text-[var(--muted)] border-t border-b border-[var(--border)] py-2.5 mb-8">
        <span>{sampleRecipes.length} recipes</span>
        <span>·</span>
        <span>Sorted by: relevance</span>
        <div className="ml-auto flex gap-3">
          <span>Grid</span>
          <span className="text-[var(--accent)]">List</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {sampleRecipes.map(recipe => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
