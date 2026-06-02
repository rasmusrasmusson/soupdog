'use client';
import type { Recipe } from '@/types';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Heart, Sparkles, Users, Sliders } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PlanView } from '@/components/plan/PlanView';

// Note: `recipes` is still accepted (passed by HomeClient) but the logged-in
// home now leads with the meal plan. Recipes remain reachable via search and the
// Recipes nav. The old "Featured recipes" table + placeholder cards were removed
// in favour of the plan + enrichment.
export function LoggedInHome({ recipes: _recipes }: { recipes: Recipe[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-full bg-[var(--bg)]">

      {/* Search box — kept. (Becomes a smarter/conversational box in a later slice.) */}
      <div className="w-full flex flex-col items-center pt-10 pb-6 px-4">
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--accent)] transition-colors">
            <Search size={15} strokeWidth={1.5} className="text-[var(--muted)] flex-shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search recipes, ingredients, techniques..."
              className="flex-1 bg-transparent text-[14px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[var(--muted)] hover:text-[var(--fg)] font-mono text-[11px]">✕</button>
            )}
          </div>
        </div>
      </div>

      {/* The meal plan IS the home. PlanView handles its own states
          (no-plan activation / active menu) and its own width. */}
      <div className="w-full">
        <PlanView />
      </div>

      {/* Improve your plan — benefit-led, no completion meter */}
      <div className="w-full max-w-2xl px-4 pb-16">
        <ImproveYourPlan />
      </div>
    </div>
  );
}

function ImproveYourPlan() {
  const items = [
    {
      icon: Sparkles,
      title: 'Set your tastes',
      benefit: 'Get dishes you’ll actually look forward to.',
      href: '/my/profile',
    },
    {
      icon: Heart,
      title: 'Add health details',
      benefit: 'Plans that respect your allergies and goals.',
      href: '/my/profile',
    },
    {
      icon: Users,
      title: 'Add your household',
      benefit: 'Plan for everyone you cook for.',
      href: '/my/people',
    },
    {
      icon: Sliders,
      title: 'Set your meal times',
      benefit: 'Know when to start cooking each day.',
      href: '/plan',
    },
  ];

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Make your plan better</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(({ icon: Icon, title, benefit, href }) => (
          <Link key={title} href={href}
            className="group flex items-start gap-3 border border-[var(--border)] p-4 hover:border-[var(--accent)] transition-colors">
            <Icon size={16} strokeWidth={1.5} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[13px] font-medium text-[var(--fg)] mb-0.5">{title}</div>
              <div className="text-[12px] text-[var(--muted)] leading-relaxed">{benefit}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
