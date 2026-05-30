'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';
import { SoupdogIcon } from '@/components/icons/SoupdogIcon';
import {
  BookMarked, Info, HelpCircle, ChevronLeft, ChevronRight
} from 'lucide-react';

const publicNav = [
  { key: 'recipes',     href: '/recipes',     icon: 'recipes'     as const },
  { key: 'ingredients', href: '/ingredients', icon: 'ingredients' as const },
  { key: 'techniques',  href: '/techniques',  icon: 'techniques'  as const },
  { key: 'tools',       href: '/equipment',   icon: 'tools'       as const },
];

function NavItem({ navKey, href, icon, collapsed }: {
  navKey: string;
  href: string;
  icon: 'recipes' | 'ingredients' | 'techniques' | 'tools';
  collapsed: boolean;
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
      <SoupdogIcon
        name={icon}
        size={13}
        strokeWidth={1.6}
        className={cn('flex-shrink-0', active ? 'text-[var(--accent)]' : '')}
      />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function LucideNavItem({ navKey, href, icon: Icon, collapsed }: {
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
        {publicNav.map(item => (
          <NavItem key={item.href} navKey={item.key} href={item.href} icon={item.icon} collapsed={collapsed} />
        ))}
        <SectionLabel navKey="myKitchen" collapsed={collapsed} />
        <LucideNavItem navKey="myRecipes" href="/my/recipes" icon={BookMarked} collapsed={collapsed} />
        <LucideNavItem navKey="myProducts" href="/my/products" icon={BookMarked} collapsed={collapsed} />
        <SectionLabel navKey="about" collapsed={collapsed} />
        <LucideNavItem navKey="aboutSoupdog" href="/about" icon={Info} collapsed={collapsed} />
        <LucideNavItem navKey="help" href="/help" icon={HelpCircle} collapsed={collapsed} />
      </nav>

      {!collapsed && (
        <div className="px-3 py-2.5 border-t border-[var(--border)] text-[9px] text-[var(--muted)] font-mono">
          © {new Date().getFullYear()} Soupdog
        </div>
      )}
    </aside>
  );
}
