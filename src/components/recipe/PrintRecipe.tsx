// src/components/recipe/PrintRecipe.tsx
// Two tiny, shared pieces for the Print / Save-as-PDF feature on recipe pages:
//
//  <PrintButton />      — a screen-only "Print" button (Lucide printer icon) that
//                         calls window.print(). Hidden from the printout itself.
//  <PrintHeader title /> — a PRINT-ONLY Soupdog wordmark + recipe title shown at
//                         the top of the printed page (hidden on screen).
//
// All paper-size / orientation handling is the browser's print dialog; the print
// CSS in globals.css (@media print) does the chrome-stripping and break hygiene.

'use client';

import { Printer } from 'lucide-react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print"
      style={{
        ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--muted)', background: 'none', border: '1px solid var(--border)',
        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <Printer size={12} /> {label}
    </button>
  );
}

// Print-only masthead: subtle Soupdog wordmark + the recipe title. The `.print-only`
// class keeps it hidden on screen and visible only when printing (see globals.css).
export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="print-only" style={{ marginBottom: 16, borderBottom: '1px solid #ccc', paddingBottom: 10 }}>
      <div style={{ ...MONO, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#555' }}>
        soup<span style={{ color: '#2e4638' }}>dog</span>
      </div>
      <div style={{ ...SERIF, fontSize: 22, color: '#111', marginTop: 4 }}>{title}</div>
      {subtitle ? <div style={{ ...MONO, fontSize: 10, color: '#777', marginTop: 2 }}>{subtitle}</div> : null}
    </div>
  );
}

// Optional subtle per-print footer line (source URL feel). Print-only.
export function PrintFooter() {
  return (
    <div className="print-only" style={{ marginTop: 20, paddingTop: 8, borderTop: '1px solid #eee', ...MONO, fontSize: 9, color: '#999', letterSpacing: '0.1em' }}>
      soup.dog
    </div>
  );
}
