import Link from 'next/link';
import { Clock, Star } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import type { Recipe } from '@/types';

const difficultyLabel: Record<string, string> = {
  trivial: 'Trivial', easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert',
};

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/recipes/${recipe.slug}`} className="group block border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-colors">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[15px] font-normal text-[var(--fg)] leading-snug group-hover:text-[var(--accent)] transition-colors">
            {recipe.title}
          </h3>
          {recipe.ratings && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--muted)] flex-shrink-0 mt-0.5">
              <Star size={10} className="fill-[var(--muted)] text-[var(--muted)]" />
              {recipe.ratings.average.toFixed(1)}
            </span>
          )}
        </div>
        {recipe.description && (
          <p className="text-[12px] text-[var(--muted)] mt-1.5 leading-relaxed line-clamp-2">{recipe.description}</p>
        )}
      </div>

      {/* Meta table */}
      <table className="w-full text-[11px]">
        <tbody>
          <tr className="border-b border-[var(--border-subtle)]">
            <td className="px-4 py-2 font-mono text-[var(--muted)] w-1/3">Time</td>
            <td className="px-4 py-2 text-[var(--fg)] font-mono">{formatDuration(recipe.totalTimeSeconds)}</td>
          </tr>
          <tr className="border-b border-[var(--border-subtle)]">
            <td className="px-4 py-2 font-mono text-[var(--muted)]">Difficulty</td>
            <td className="px-4 py-2 text-[var(--fg)]">{difficultyLabel[recipe.difficulty]}</td>
          </tr>
          <tr>
            <td className="px-4 py-2 font-mono text-[var(--muted)]">Cuisine</td>
            <td className="px-4 py-2 text-[var(--fg)]">{recipe.cuisine ?? '—'}</td>
          </tr>
        </tbody>
      </table>
    </Link>
  );
}
