// src/app/admin/nutrition/page.tsx
'use client';
import React, { useState, useEffect, useMemo } from 'react';

type Row = {
  id: string; name: string; slug: string | null; isProduct: boolean;
  fdcId: string | null; matchedAt: string | null; bestGrade: string | null;
  matchStatus: 'unmatched' | 'auto_matched' | 'needs_review' | 'confirmed';
};
type Candidate = {
  fdcId: string; description: string; dataType: string;
  brand: string | null; markers: Record<string, number | null>;
};

const GRADE_LABEL: Record<string, string> = {
  e4_validated: 'Validated', e3_tested: 'Lab tested', e2_expert: 'USDA (Foundation)',
  e1_literature: 'USDA (SR Legacy)', u_user_feedback: 'User', e0_inferred: 'Estimate',
};
const GRADE_COLOR: Record<string, string> = {
  e4_validated: '#2e7d32', e3_tested: '#2e7d32', e2_expert: '#2e4638',
  e1_literature: '#2e4638', u_user_feedback: '#8a6d00', e0_inferred: '#8a6d00',
};

const B = '1px solid var(--border)';
const mono = { fontFamily: 'var(--font-mono)' } as const;

export default function NutritionWorklistPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'estimate' | 'review'>('estimate');
  const [hideProducts, setHideProducts] = useState(true);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoMsg, setAutoMsg] = useState('');

  // per-ingredient match panel state
  const [openId, setOpenId] = useState<string | null>(null);
  const [usdaQuery, setUsdaQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/check').then(r => r.json())
      .then(d => setIsAdmin(Boolean(d.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  const load = () => {
    fetch('/api/admin/nutrition/worklist').then(r => r.json())
      .then(d => setRows(d.ingredients ?? [])).catch(() => setRows([]));
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (hideProducts && r.isProduct) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (filter === 'unmatched' && r.fdcId) return false;
      if (filter === 'estimate' && r.bestGrade && r.bestGrade !== 'e0_inferred') return false;
      if (filter === 'review' && r.matchStatus !== 'needs_review') return false;
      return true;
    });
  }, [rows, query, filter, hideProducts]);

  const openMatch = (r: Row) => {
    setOpenId(r.id); setUsdaQuery(r.name); setCandidates(null); setMsg('');
  };

  const runSearch = async () => {
    if (!usdaQuery.trim()) return;
    setSearching(true); setCandidates(null); setMsg('');
    try {
      const res = await fetch(`/api/admin/usda/search?q=${encodeURIComponent(usdaQuery)}`);
      const d = await res.json();
      if (!res.ok) { setMsg(d.error ?? 'Search failed.'); setCandidates([]); }
      else setCandidates(d.candidates ?? []);
    } catch { setMsg('Search failed.'); setCandidates([]); }
    finally { setSearching(false); }
  };

  const runAutoMatch = async () => {
    setAutoRunning(true); setAutoMsg('Matching…');
    try {
      const res = await fetch('/api/admin/nutrition/auto-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 20 }),
      });
      const d = await res.json();
      if (!res.ok) { setAutoMsg(d.error ?? 'Auto-match failed.'); }
      else {
        setAutoMsg(`Processed ${d.processed}: ${d.imported} matched, ${d.flagged} flagged for review. ${d.remaining} unmatched left.`);
        load();
      }
    } catch { setAutoMsg('Auto-match failed.'); }
    finally { setAutoRunning(false); }
  };

  // Run batches back-to-back until nothing is left (or Stop is pressed).
  const stopRef = React.useRef(false);
  const runUntilDone = async () => {
    stopRef.current = false;
    setAutoRunning(true);
    let totMatched = 0, totFlagged = 0, batches = 0;
    try {
      while (!stopRef.current) {
        const res = await fetch('/api/admin/nutrition/auto-match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 20 }),
        });
        const d = await res.json();
        if (!res.ok) { setAutoMsg(d.error ?? 'Auto-match failed.'); break; }
        batches++; totMatched += d.imported; totFlagged += d.flagged;
        setAutoMsg(`Running… ${batches} batches: ${totMatched} matched, ${totFlagged} flagged. ${d.remaining} left.`);
        if (d.remaining <= 0 || d.processed === 0) {
          setAutoMsg(`Done. ${totMatched} matched, ${totFlagged} flagged for review across ${batches} batches.`);
          break;
        }
      }
      if (stopRef.current) setAutoMsg(prev => prev.replace('Running…', 'Stopped at'));
    } finally { setAutoRunning(false); load(); }
  };

  const confirmMatch = async (ingredientId: string, fdcId: string) => {
    setImporting(fdcId); setMsg('');
    try {
      const res = await fetch(`/api/admin/ingredients/${ingredientId}/import-nutrition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fdcId }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error ?? 'Import failed.'); }
      else {
        setMsg(`Imported ${d.nutrientsImported} nutrients from ${d.description} (${d.grade.startsWith('e2') ? 'Foundation' : 'SR Legacy'}).`);
        setOpenId(null); setCandidates(null); load();
      }
    } catch { setMsg('Import failed.'); }
    finally { setImporting(null); }
  };

  if (isAdmin === null) return <div style={{ padding: 40, ...mono, color: 'var(--muted)' }}>Checking…</div>;
  if (!isAdmin) return <div style={{ padding: 40, ...mono, color: 'var(--muted)' }}>Not authorised.</div>;

  const counts = rows ? {
    total: rows.filter(r => !r.isProduct).length,
    estimate: rows.filter(r => !r.isProduct && (!r.bestGrade || r.bestGrade === 'e0_inferred')).length,
    matched: rows.filter(r => !r.isProduct && r.fdcId).length,
  } : null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 80px' }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
        Admin · Nutrition sourcing
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, margin: 0, color: 'var(--fg)' }}>
        Match ingredients to USDA data
      </h1>
      {counts && (
        <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14 }}>
          {counts.matched} of {counts.total} matched · {counts.estimate} still on estimates
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
        <button onClick={runAutoMatch} disabled={autoRunning}
          style={{ ...mono, fontSize: 12, padding: '9px 16px', cursor: autoRunning ? 'default' : 'pointer',
            border: '1px solid var(--accent)', background: autoRunning ? 'var(--accent-subtle)' : 'var(--accent)',
            color: autoRunning ? 'var(--accent)' : '#fff' }}>
          {autoRunning ? 'Matching…' : 'Auto-match next 20'}
        </button>
        {!autoRunning && (
          <button onClick={runUntilDone}
            style={{ ...mono, fontSize: 12, padding: '9px 16px', cursor: 'pointer',
              border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)' }}>
            Run until done
          </button>
        )}
        {autoRunning && (
          <button onClick={() => { stopRef.current = true; }}
            style={{ ...mono, fontSize: 12, padding: '9px 16px', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)' }}>
            Stop
          </button>
        )}
        {autoMsg && <span style={{ ...mono, fontSize: 12, color: 'var(--muted)' }}>{autoMsg}</span>}
      </div>

      {/* controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '20px 0' }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Filter ingredients…"
          style={{ flex: '1 1 240px', padding: '9px 12px', border: B, background: 'var(--surface)', color: 'var(--fg)', ...mono, fontSize: 13 }}
        />
        {(['estimate', 'unmatched', 'review', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              ...mono, fontSize: 11, letterSpacing: '0.06em', padding: '8px 12px', cursor: 'pointer',
              border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === f ? 'var(--accent-subtle)' : 'transparent',
              color: filter === f ? 'var(--accent)' : 'var(--fg)', textTransform: 'uppercase',
            }}>
            {f === 'estimate' ? 'On estimates' : f === 'unmatched' ? 'Unmatched' : f === 'review' ? 'Needs review' : 'All'}
          </button>
        ))}
        <label style={{ ...mono, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={hideProducts} onChange={e => setHideProducts(e.target.checked)} />
          Hide products
        </label>
      </div>

      {msg && <div style={{ ...mono, fontSize: 12, color: 'var(--accent)', padding: '8px 0', marginBottom: 8 }}>{msg}</div>}

      {/* list */}
      {!rows ? <div style={{ ...mono, color: 'var(--muted)' }}>Loading…</div> : (
        <div style={{ border: B }}>
          {filtered.map((r, idx) => (
            <div key={r.id} style={{ borderTop: idx ? B : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <div style={{ flex: 1, color: 'var(--fg)', fontSize: 14 }}>{r.name}</div>
                {r.matchStatus === 'needs_review' && (
                  <span style={{ ...mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8a6d00' }}>
                    Needs review
                  </span>
                )}
                {r.matchStatus === 'auto_matched' && (
                  <span style={{ ...mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Auto
                  </span>
                )}
                {r.bestGrade && (
                  <span style={{ ...mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: GRADE_COLOR[r.bestGrade] ?? 'var(--muted)' }}>
                    {GRADE_LABEL[r.bestGrade] ?? r.bestGrade}
                  </span>
                )}
                {r.fdcId && <span style={{ ...mono, fontSize: 10, color: 'var(--muted)' }}>FDC:{r.fdcId}</span>}
                <button onClick={() => openId === r.id ? setOpenId(null) : openMatch(r)}
                  style={{ ...mono, fontSize: 11, padding: '6px 12px', cursor: 'pointer', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)' }}>
                  {r.fdcId ? 'Re-match' : 'Match'}
                </button>
              </div>

              {openId === r.id && (
                <div style={{ padding: '4px 14px 16px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={usdaQuery} onChange={e => setUsdaQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && runSearch()}
                      placeholder="Search USDA…"
                      style={{ flex: 1, padding: '8px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', ...mono, fontSize: 12 }}
                    />
                    <button onClick={runSearch} disabled={searching}
                      style={{ ...mono, fontSize: 11, padding: '8px 14px', cursor: 'pointer', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff' }}>
                      {searching ? 'Searching…' : 'Search'}
                    </button>
                  </div>

                  {candidates && candidates.length === 0 && (
                    <div style={{ ...mono, fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>No candidates.</div>
                  )}
                  {candidates && candidates.length > 0 && (
                    <div style={{ marginTop: 10, border: B, background: 'var(--bg)' }}>
                      {candidates.map((c, i) => (
                        <div key={c.fdcId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderTop: i ? B : 'none' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: 'var(--fg)' }}>{c.description}</div>
                            <div style={{ ...mono, fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                              {c.dataType}{c.brand ? ` · ${c.brand}` : ''} · {c.markers.kcal ?? '–'} kcal · {c.markers.fat ?? '–'}g fat · {c.markers.protein ?? '–'}g protein · FDC:{c.fdcId}
                            </div>
                          </div>
                          <button onClick={() => confirmMatch(r.id, c.fdcId)} disabled={importing === c.fdcId}
                            style={{ ...mono, fontSize: 11, padding: '6px 12px', cursor: 'pointer', border: '1px solid var(--accent)', background: importing === c.fdcId ? 'var(--accent-subtle)' : 'transparent', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                            {importing === c.fdcId ? 'Importing…' : 'Use this'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ ...mono, color: 'var(--muted)', padding: 16 }}>Nothing matches.</div>}
        </div>
      )}
    </div>
  );
}
