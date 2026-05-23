'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Leaf, Search, Heart, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';

const items = [
  { key: 'recipes',     href: '/recipes',      icon: BookOpen },
  { key: 'ingredients', href: '/ingredients',  icon: Leaf },
  { key: 'search',      href: '/search',       icon: Search },
  { key: 'favorites',   href: '/my/favorites', icon: Heart },
  { key: 'myRecipes',   href: '/my/recipes',   icon: User },
];

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-around h-14 safe-area-pb">
      {items.map(({ key, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={href} href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-2 flex-1 transition-colors',
              active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
            )}>
            <Icon size={20} strokeWidth={1.5} />
            <span className="text-[9px] font-mono uppercase tracking-wider">{t(`nav.${key}`)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
