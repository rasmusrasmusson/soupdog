'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';
import {
  BookOpen, Leaf, Zap, Package, FolderOpen,
  BookMarked, Heart, Clock, Info, Code2,
  HelpCircle, GitFork, ChevronLeft, ChevronRight, X
} from 'lucide-react';

const publicNav = [
  { key: 'recipes',     href: '/recipes',     icon: BookOpen },
  { key: 'ingredients', href: '/ingredients', icon: Leaf },
  { key: 'techniques',  href: '/techniques',  icon: Zap },
  { key: 'collections', href: '/collections', icon: FolderOpen },
  { key: 'equipment',   href: '/equipment',   icon: Package },
];
const privateNav = [
  { key: 'myRecipes',  href: '/my/recipes',   icon: BookMarked },
  { key: 'cookbooks',  href: '/my/cookbooks', icon: BookOpen },
  { key: 'favorites',  href: '/my/favorites', icon: Heart },
  { key: 'history',    href: '/my/history',   icon: Clock },
];
const metaNav = [
  { key: 'aboutSoupdog', href: '/about',     icon: Info },
  { key: 'api',          href: '/api-docs',  icon: Code2 },
  { key: 'help',         href: '/help',      icon: HelpCircle },
  { key: 'changelog',    href: '/changelog', icon: GitFork },
];

function NavItem({ navKey, href, icon: Icon, collapsed }: {
  navKey: string; href: string; icon: React.ElementType; collapsed: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLocale();
  const active = pathname === href || pathname.startsWith(href + '/');
  const label = t(`nav.${navKey}`);

  return (
    <Link href={href} title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 py-[7px] text-[12px] transition-colors border-s-2',
        collapsed ? 'px-2.5 justify-center' : 'px-3',
        active
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--fg)] font-medium'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]'
      )}>
      <Icon size={13} strokeWidth={1.5} className={cn('flex-shrink-0', active ? 'text-[var(--accent)]' : '')} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function SectionLabel({ navKey, collapsed }: { navKey: string; collapsed: boolean }) {
  const { t } = useLocale();
  if (collapsed) return <div className="my-1.5 mx-2 border-t border-[var(--border)]" />;
  return (
    <div className="px-3 pt-4 pb-1 text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--muted)] select-none">
      {t(`nav.${navKey}`)}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useLocale();

  return (
    <aside className={cn(
      'flex-shrink-0 border-e border-[var(--border)] flex flex-col bg-[var(--surface)] transition-all duration-150',
      // Hidden on mobile, visible from md up
      'hidden md:flex',
      collapsed ? 'w-10' : 'w-44'
    )}>
      {/* Collapse toggle */}
      <div className={cn(
        'flex items-center border-b border-[var(--border)] px-2 py-2',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--muted)] px-1">
            {t('nav.browse')}
          </span>
        )}
        <button onClick={() => setCollapsed(c => !c)}
          className="p-1 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed
            ? <ChevronRight size={12} strokeWidth={1.5} />
            : <ChevronLeft size={12} strokeWidth={1.5} />
          }
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {publicNav.map(item => <NavItem key={item.href} navKey={item.key} href={item.href} icon={item.icon} collapsed={collapsed} />)}
        <SectionLabel navKey="myKitchen" collapsed={collapsed} />
        {privateNav.map(item => <NavItem key={item.href} navKey={item.key} href={item.href} icon={item.icon} collapsed={collapsed} />)}
        <SectionLabel navKey="about" collapsed={collapsed} />
        {metaNav.map(item => <NavItem key={item.href} navKey={item.key} href={item.href} icon={item.icon} collapsed={collapsed} />)}
      </nav>

      {!collapsed && (
        <div className="px-3 py-2.5 border-t border-[var(--border)] text-[9px] text-[var(--muted)] font-mono">
          {t('footer.copyright')}
        </div>
      )}
    </aside>
  );
}
