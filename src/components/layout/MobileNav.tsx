'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, CalendarDays, User } from 'lucide-react';
import { SoupdogIcon } from '@/components/icons/SoupdogIcon';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  // label with English fallback when the i18n key isn't present yet
  const label = (key: string, fallback: string) => {
    const v = t(`nav.${key}`);
    return v === `nav.${key}` ? fallback : v;
  };

  const items = [
    {
      key: 'plan', href: '/plan', label: label('plan', 'Plan'),
      renderIcon: (active: boolean) => (
        <CalendarDays size={20} strokeWidth={1.5}
          className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
      ),
    },
    {
      key: 'recipes', href: '/recipes', label: label('recipes', 'Recipes'),
      renderIcon: (active: boolean) => (
        <SoupdogIcon name="recipes" size={20} strokeWidth={1.6}
          className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
      ),
    },
    {
      key: 'search', href: '/search', label: label('search', 'Search'),
      renderIcon: (active: boolean) => (
        <Search size={20} strokeWidth={1.5}
          className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
      ),
    },
    {
      key: 'ingredients', href: '/ingredients', label: label('ingredients', 'Ingredients'),
      renderIcon: (active: boolean) => (
        <SoupdogIcon name="ingredients" size={20} strokeWidth={1.6}
          className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
      ),
    },
    {
      key: 'myRecipes', href: '/my/recipes', label: label('myRecipes', 'My Recipes'),
      renderIcon: (active: boolean) => (
        <User size={20} strokeWidth={1.5}
          className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
      ),
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-around h-14 safe-area-pb">
      {items.map(({ key, href, label, renderIcon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={href} href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-2 flex-1 transition-colors',
              active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
            )}>
            {renderIcon(active)}
            <span className="text-[9px] font-mono uppercase tracking-wider">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
