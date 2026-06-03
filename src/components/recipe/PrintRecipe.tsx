// src/components/recipe/PrintRecipe.tsx
// Print / Save-as-PDF helpers for recipe pages.
//
//  <PrintButton title /> — screen-only "Print" button. Sets document.title to the
//      recipe name first (so the saved PDF is NAMED after the recipe), prints,
//      then restores the title. Hidden from the printout.
//  <PrintHeader title subtitle url /> — PRINT-ONLY masthead: the Soupdog logo
//      (/wordmark.svg — the dog + name), the recipe title/meta, and a small QR
//      code linking back to the recipe (scan to reopen — no long URL to type).
//
// Paper size/orientation = the browser print dialog. The @media print CSS in
// globals.css strips chrome, sets white/black, and handles page-break hygiene.

'use client';

import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;

// Print, naming the PDF after the recipe. Browsers use document.title as the
// default Save-as-PDF filename, so we set it for the duration of the print.
function printAs(title: string) {
  const prev = document.title;
  // Sanitise to a clean filename-ish title (browsers strip illegal chars anyway).
  document.title = title.replace(/\s+/g, ' ').trim() || prev;
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  // Fallback restore in case afterprint doesn't fire (some browsers).
  setTimeout(restore, 1000);
}

export function PrintButton({ title, label = 'Print' }: { title?: string; label?: string }) {
  return (
    <button
      onClick={() => printAs(title ?? document.title)}
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

// Print-only masthead. Logo left, title + meta centre-left, QR right.
export function PrintHeader({ title, subtitle, url }: { title: string; subtitle?: string; url?: string }) {
  return (
    <div className="print-only" style={{
      marginBottom: 18, borderBottom: '1.5px solid #222', paddingBottom: 12,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        {/* Real Soupdog logo (dog + wordmark), same asset as the site header. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wordmark.svg" alt="Soupdog" style={{ height: 26, width: 'auto', marginBottom: 10 }} />
        <div style={{ ...SERIF, fontSize: 24, color: '#111', lineHeight: 1.15 }}>{title}</div>
        {subtitle ? <div style={{ ...MONO, fontSize: 10, color: '#777', marginTop: 4, letterSpacing: '0.04em' }}>{subtitle}</div> : null}
      </div>
      {url ? (
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <QRCodeSVG value={url} size={68} level="M" includeMargin={false} />
          <div style={{ ...MONO, fontSize: 7.5, color: '#999', marginTop: 4, letterSpacing: '0.08em', maxWidth: 72 }}>
            SCAN TO OPEN
          </div>
        </div>
      ) : null}
    </div>
  );
}
