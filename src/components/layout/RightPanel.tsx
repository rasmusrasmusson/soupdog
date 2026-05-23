'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { UnitSystem } from '@/types';

const unitOptions: { value: UnitSystem; label: string }[] = [
  { value: 'si',       label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
  { value: 'us',       label: 'US Customary' },
];

const langOptions = [
  { value: 'en', label: 'English' },
  { value: 'sv', label: 'Svenska' },
  { value: 'fr', label: 'Français' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
];

interface RightPanelProps {
  servings?: number;
  onServingsChange?: (n: number) => void;
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border)]">
      <div className="px-4 py-2 bg-[var(--surface-hover)] border-b border-[var(--border)]">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

export function RightPanel({ servings = 4, onServingsChange }: RightPanelProps) {
  const [unit, setUnit] = useState<UnitSystem>('si');
  const [lang, setLang] = useState('en');
  const [count, setCount] = useState(servings);

  const updateServings = (n: number) => {
    const clamped = Math.max(1, n);
    setCount(clamped);
    onServingsChange?.(clamped);
  };

  return (
    <aside className="w-48 flex-shrink-0 border-l border-[var(--border)] sticky top-0 h-screen overflow-y-auto bg-[var(--surface)]">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-hover)]">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">Controls</span>
      </div>

      {/* Servings */}
      <PanelSection title="Servings">
        <div className="flex items-center border border-[var(--border)]">
          <button onClick={() => updateServings(count - 1)} className="w-8 h-8 border-r border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors text-[var(--muted)] hover:text-[var(--fg)] font-mono">−</button>
          <span className="flex-1 text-center text-[13px] font-mono tabular-nums">{count}</span>
          <button onClick={() => updateServings(count + 1)} className="w-8 h-8 border-l border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors text-[var(--muted)] hover:text-[var(--fg)] font-mono">+</button>
        </div>
      </PanelSection>

      {/* Unit system */}
      <PanelSection title="Unit System">
        <div className="space-y-0.5">
          {unitOptions.map(o => (
            <button
              key={o.value}
              onClick={() => setUnit(o.value)}
              className={cn(
                'w-full text-left text-[12px] px-2 py-1.5 flex items-center justify-between transition-colors',
                unit === o.value
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]'
              )}
            >
              {o.label}
              {unit === o.value && <span className="text-[10px] font-mono text-[var(--accent)]">✓</span>}
            </button>
          ))}
        </div>
      </PanelSection>

      {/* Language */}
      <PanelSection title="Language">
        <div className="space-y-0.5">
          {langOptions.map(o => (
            <button
              key={o.value}
              onClick={() => setLang(o.value)}
              className={cn(
                'w-full text-left text-[12px] px-2 py-1.5 flex items-center justify-between transition-colors',
                lang === o.value
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]'
              )}
            >
              {o.label}
              {lang === o.value && <span className="text-[10px] font-mono text-[var(--accent)]">✓</span>}
            </button>
          ))}
        </div>
      </PanelSection>
    </aside>
  );
}
