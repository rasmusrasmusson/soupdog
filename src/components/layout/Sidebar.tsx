'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BookOpen, Leaf, Zap, Package, FolderOpen,
  BookMarked, Heart, Clock, Info, Code2,
  HelpCircle, GitFork, ChevronLeft, ChevronRight
} from 'lucide-react';

const publicNav = [
  { label: 'Recipes',     href: '/recipes',     icon: BookOpen },
  { label: 'Ingredients', href: '/ingredients', icon: Leaf },
  { label: 'Techniques',  href: '/techniques',  icon: Zap },
  { label: 'Collections', href: '/collections', icon: FolderOpen },
  { label: 'Equipment',   href: '/equipment',   icon: Package },
];
const privateNav = [
  { label: 'My Recipes', href: '/my/recipes',   icon: BookMarked },
  { label: 'Cookbooks',  href: '/my/cookbooks', icon: BookOpen },
  { label: 'Favorites',  href: '/my/favorites', icon: Heart },
  { label: 'History',    href: '/my/history',   icon: Clock },
];
const metaNav = [
  { label: 'About Soupdog', href: '/about',     icon: Info },
  { label: 'API',           href: '/api-docs',  icon: Code2 },
  { label: 'Help',          href: '/help',      icon: HelpCircle },
  { label: 'Change Log',    href: '/changelog', icon: GitFork },
];

function NavItem({ label, href, icon: Icon, collapsed }: {
  label: string; href: string; icon: React.ElementType; collapsed: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 py-[7px] text-[12px] transition-colors border-l-2',
        collapsed ? 'px-2.5 justify-center' : 'px-3',
        active
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--fg)] font-medium'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]'
      )}
    >
      <Icon size={13} strokeWidth={1.5} className={cn('flex-shrink-0', active ? 'text-[var(--accent)]' : '')} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-1.5 mx-2 border-t border-[var(--border)]" />;
  return (
    <div className="px-3 pt-4 pb-1 text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--muted)] select-none">
      {children}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn(
      'flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--surface)] transition-all duration-150',
      collapsed ? 'w-10' : 'w-44'
    )}>
      {/* Collapse toggle */}
      <div className={cn(
        'flex items-center border-b border-[var(--border)] px-2 py-2',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--muted)] px-1">Browse</span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight size={12} strokeWidth={1.5} />
            : <ChevronLeft size={12} strokeWidth={1.5} />
          }
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {publicNav.map(item => <NavItem key={item.href} {...item} collapsed={collapsed} />)}
        <SectionLabel collapsed={collapsed}>My Kitchen</SectionLabel>
        {privateNav.map(item => <NavItem key={item.href} {...item} collapsed={collapsed} />)}
        <SectionLabel collapsed={collapsed}>About</SectionLabel>
        {metaNav.map(item => <NavItem key={item.href} {...item} collapsed={collapsed} />)}
      </nav>

      {!collapsed && (
        <div className="px-3 py-2.5 border-t border-[var(--border)] text-[9px] text-[var(--muted)] font-mono">
          © 2025 soupdog
        </div>
      )}
    </aside>
  );
}
