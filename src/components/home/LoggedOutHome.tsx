'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';
import type { Recipe } from '@/types';

export function LoggedOutHome({ recipes }: { recipes: Recipe[] }) {
  const { t } = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [dietary, setDietary] = useState('All');
  const [diff, setDiff] = useState('All');

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const all = t('home.all');
  const CUISINES   = [all, 'Indian', 'European', 'Asian', 'American', 'Middle Eastern'];
  const DIETARY    = [all, 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'];
  const DIFFICULTY = [all, 'Easy', 'Medium', 'Hard'];

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Hero */}
      <div className="flex flex-col items-center pt-12 md:pt-20 pb-8 px-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] mb-3">
          {t('home.tagline')}
        </p>
        <h1 className="font-display text-[32px] md:text-[48px] font-light text-[var(--fg)] leading-tight mb-3 max-w-xl">
          {t('home.headline')}
        </h1>
        <p className="text-[12px] md:text-[13px] text-[var(--muted)] max-w-md mb-8 leading-relaxed px-4">
          Structured recipes, precise execution, connected appliances.
        </p>

        {/* Search */}
        <div className="w-full max-w-xl px-4 md:px-0">
          <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--accent)] transition-colors shadow-sm">
            <Search size={15} strokeWidth={1.5} className="text-[var(--muted)] flex-shrink-0" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleSearchKeyDown}
              placeholder={t('home.searchPlaceholder')}
              className="flex-1 bg-transparent text-[14px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none" />
          </div>

          {/* Filters — scrollable on mobile */}
          <div className="mt-3 overflow-x-auto">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 min-w-max md:min-w-0 px-1">
              <FilterGroup label={t('home.cuisine')}    options={CUISINES}   value={cuisine} onChange={setCuisine} />
              <FilterGroup label={t('home.dietary')}    options={DIETARY}    value={dietary} onChange={setDietary} />
              <FilterGroup label={t('home.difficulty')} options={DIFFICULTY} value={diff}    onChange={setDiff} />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pb-16 space-y-8">
        {/* Featured recipes */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{t('home.featuredRecipes')}</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
            <Link href="/recipes" className="font-mono text-[9px] text-[var(--muted)] hover:text-[var(--accent)] transition-colors">{t('home.viewAll')}</Link>
          </div>
          <div className="table-responsive">
            <RecipeTable recipes={recipes} t={t} />
          </div>
        </section>

        {/* Value props — stack on mobile */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--border)] border border-[var(--border)]">
          {[
            ['Food process graph',   'Every ingredient is a transformed state. Every recipe is a structured execution graph.'],
            ['Versioned recipes',    'Any change creates a new version. Track lineage, derive variants, roll back.'],
            ['Connected appliances', 'Recipes become machine-readable programs for smart ovens and connected kitchens.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-[var(--surface)] px-5 py-5">
              <p className="text-[12px] font-medium text-[var(--fg)] mb-1.5">{title}</p>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </section>

        {/* Sign up CTA */}
        <section className="border border-[var(--border)] p-6 md:p-8 text-center">
          <h2 className="font-display text-[22px] md:text-[24px] font-light text-[var(--fg)] mb-2">{t('home.signupTitle')}</h2>
          <p className="text-[12px] text-[var(--muted)] mb-6 max-w-sm mx-auto leading-relaxed">{t('home.signupDesc')}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/signup"
              className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-6 py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors tracking-wide w-full sm:w-auto justify-center">
              {t('home.signupCta')} <ArrowRight size={13} />
            </Link>
            <Link href="/login" className="text-[12px] font-mono text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              {t('home.signinCta')} →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`font-mono text-[10px] px-2 py-0.5 border transition-colors ${
              value === o
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]'
            }`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function RecipeTable({ recipes, t }: { recipes: Recipe[]; t: (k: string) => string }) {
  return (
    <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', border: '1px solid var(--border)' }}>
      <thead>
        <tr style={{ background: 'var(--surface-hover)' }}>
          {['home.featuredRecipes', 'recipe.cuisine', 'recipe.totalTime', 'recipe.difficulty', 'recipe.rating'].map((k, i, arr) => (
            <th key={k} style={{
              padding: '7px 14px', fontFamily: 'var(--font-mono)', fontSize: 9,
              textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)',
              textAlign: i > 1 ? 'right' : 'left',
              borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined,
            }}>{i === 0 ? t('nav.recipes') : t(k)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {recipes.map(r => (
          <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}
            className="hover:bg-[var(--surface-hover)] transition-colors">
            <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontWeight: 500 }}>
              <Link href={`/recipes/${r.slug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                className="hover:text-[var(--accent)] transition-colors">{r.title}</Link>
              {r.tags && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{r.tags.slice(0, 2).join(' · ')}</span>}
            </td>
            <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>{r.cuisine ?? '—'}</td>
            <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--muted)' }}>{formatDuration(r.totalTimeSeconds)}</td>
            <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>{r.difficulty}</td>
            <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--muted)' }}>{r.ratings ? r.ratings.average.toFixed(1) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
