'use client';

import { Search } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

const TYPES = ['All', 'Recipes', 'Ingredients', 'Techniques', 'Equipment'] as const;
type ContentType = typeof TYPES[number];

// Map UI labels to search_index type values
// Ingredients now includes both 'ingredient' and 'product' types
const TYPE_MAP: Record<ContentType, string[] | null> = {
  All:        null,
  Recipes:    ['recipe'],
  Ingredients:['ingredient', 'product'],
  Techniques: ['technique', 'task'],
  Equipment:  ['equipment'],
};

interface SearchResult {
  id:    string;
  slug:  string;
  type:  string;
  title: string;
}

// A product found on Open Food Facts that isn't yet in our DB — offered to add.
interface AddableProduct {
  barcode: string;
  name:    string;
  brand?:  string | null;
  image?:  string | null;
  netWeightG?: number | null;
  nutrition?: any;
}

// Detect if a query looks like a barcode (8-14 digits)
function isBarcode(q: string) {
  return /^\d{8,14}$/.test(q.trim());
}

export default function SearchPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [query,       setQuery]       = useState('');
  const [contentType, setContentType] = useState<ContentType>('Recipes');
  const [results,     setResults]     = useState<SearchResult[]>([]);
  const [loading,     setLoading]     = useState(false);

  // Barcode "not in the system" results (from Open Food Facts) + add state.
  const [addable,   setAddable]   = useState<AddableProduct[]>([]);
  const [adding,    setAdding]    = useState<string | null>(null); // barcode being added

  // Eligibility to add products = logged in. Use the shared auth context (the
  // same source the header uses) — a direct client getUser() can race/return
  // null even when the user is signed in.
  const { user } = useAuth();
  const loggedIn = !!user;

  // Sync state from URL params on load — default 'All' not 'Recipes'
  useEffect(() => {
    const q    = searchParams.get('q') ?? '';
    const type = searchParams.get('type') as ContentType | null;
    setQuery(q);
    setContentType(type ?? 'All');
  }, [searchParams]);

  const runSearch = useCallback(async (q: string, type: ContentType) => {
    if (!q.trim()) { setResults([]); setAddable([]); return; }
    setLoading(true);
    setAddable([]);
    try {
      const supabase = createClient();
      const db = supabase as any;

      // ── Barcode lookup ──────────────────────────────────────
      if (isBarcode(q)) {
        const code = q.trim();

        // (a) what we already have, matched by stored barcode
        const { data: dbMatches } = await db
          .from('ingredients')
          .select('id, slug, name, is_product')
          .eq('barcode', code)
          .eq('is_product', true)
          .limit(5);

        const found: SearchResult[] = (dbMatches ?? []).map((r: any) => ({
          id: r.id, slug: r.slug, type: 'product', title: r.name,
        }));
        setResults(found);

        // (b) look the barcode up on Open Food Facts; offer to add anything we
        //     don't already have. Best-effort — failures just mean no "addable".
        try {
          const res = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(code)}`);
          const off = await res.json();
          if (off?.found) {
            // Barcode lookup returns a flat product object (not a `products` array).
            const haveInDb = (dbMatches ?? []).length > 0;
            if (!haveInDb && (off.name || off.product_name)) {
              setAddable([{
                barcode:    off.barcode ?? off.off_id ?? code,
                name:       off.name ?? off.product_name ?? 'Unknown product',
                brand:      off.brand ?? null,
                image:      off.image_url ?? null,
                netWeightG: off.net_weight_g ?? null,
                nutrition:  off.nutrition_per_100g ?? null,
              }]);
            }
          }
        } catch { /* OFF unavailable — leave addable empty */ }

        setLoading(false);
        return;
      }

      // ── Full-text search ────────────────────────────────────
      let query = db
        .from('search_index')
        .select('id, slug, type, title')
        .textSearch('tsv', q, { type: 'websearch', config: 'english' })
        .limit(50);

      const mapped = TYPE_MAP[type];
      if (mapped) query = query.in('type', mapped);

      const { data, error } = await query;
      if (error) throw error;

      // Deduplicate by id (search_index may have duplicates if ingredient
      // exists multiple times)
      const seen = new Set<string>();
      const deduped = (data ?? []).filter((r: SearchResult) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      setResults(deduped);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add an Open Food Facts product into our ingredients (logged-in only — the
  // /api/my/products endpoint enforces auth, returning 401 otherwise). On
  // success, move it from "not in the system" into the found results.
  const handleAddProduct = async (p: AddableProduct) => {
    setAdding(p.barcode);
    try {
      const res = await fetch('/api/my/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               p.name,
          brand:              p.brand ?? null,
          barcode:            p.barcode,
          net_weight_g:       p.netWeightG ?? null,
          nutrition_per_100g: p.nutrition ?? null,
          off_id:             p.barcode,
        }),
      });
      if (!res.ok) throw new Error('add failed');
      const created = await res.json();
      // POST returns { id, slug }; use the OFF name for the title.
      setResults((prev) => [
        { id: created.id, slug: created.slug, type: 'product', title: p.name },
        ...prev,
      ]);
      setAddable((prev) => prev.filter((a) => a.barcode !== p.barcode));
    } catch {
      // leave it in the addable list; user can retry
    } finally {
      setAdding(null);
    }
  };

  useEffect(() => {
    runSearch(query, contentType);
  }, [query, contentType, runSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const params = new URLSearchParams();
    if (value) params.set('q', value);
    // Only set type param if not 'All' (so 'All' is the default)
    if (contentType !== 'All') params.set('type', contentType);
    router.push(`/search${params.size > 0 ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  const handleTypeChange = (type: ContentType) => {
    setContentType(type);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (type !== 'All') params.set('type', type);
    router.push(`/search${params.size > 0 ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  const resultUrl = (r: SearchResult) => {
    switch (r.type) {
      case 'recipe':     return `/recipes/${r.slug}`;
      case 'ingredient':
      case 'product':    return `/ingredients/${r.slug}`;
      case 'technique':
      case 'task':       return `/techniques/${r.slug}`;
      case 'equipment':  return `/tools/${r.slug}`;
      default:           return `/${r.slug}`;
    }
  };

  const typeLabel = (type: string) => {
    if (type === 'product') return 'Product';
    if (type === 'task') return 'Technique';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <h1 className="font-display text-4xl font-light mb-8">Search</h1>

      {/* Search input */}
      <div className="flex items-center gap-3 border border-[var(--border)] rounded-sm px-4 py-3 mb-3 focus-within:border-[var(--accent)] transition-colors">
        <Search size={16} strokeWidth={1.5} className="text-[var(--muted)]" />
        <input
          autoFocus
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Search recipes, ingredients, products, barcodes…"
          className="flex-1 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
        />
        <kbd className="text-[10px] font-mono border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--muted)]">ESC</kbd>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 mb-10 flex-wrap">
        {TYPES.map((type) => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            className={`text-xs px-3 py-1.5 border rounded-sm transition-colors ${
              contentType === type
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="py-12 text-center">
          <p className="font-mono text-[12px] text-[var(--muted)] uppercase tracking-widest">
            Searching…
          </p>
        </div>
      ) : (results.length > 0 || addable.length > 0) ? (
        <>
          {/* Found results — no headline; they're just the results. */}
          {results.length > 0 && (
            <table className="w-full text-sm border-collapse mb-10">
              <tbody>
                {results.map(r => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={resultUrl(r)}
                        className="font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="py-3 text-right">
                      {r.type === 'product' ? (
                        <Link
                          href={`/ingredients/${r.slug}`}
                          className="font-mono text-[10px] uppercase tracking-widest border border-[var(--border)] px-2.5 py-1 rounded-sm text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                        >
                          View product &amp; recipes
                        </Link>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                          {typeLabel(r.type)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Not in the system — Open Food Facts matches we could add. */}
          {addable.length > 0 && (
            <>
              <div className="flex items-baseline gap-3 mb-4">
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Not in the system
                </h2>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <div className="flex flex-col gap-2 mb-6">
                {addable.map(p => (
                  <div
                    key={p.barcode}
                    className="flex items-center gap-3 border border-dashed border-[var(--border)] rounded-sm px-4 py-3"
                  >
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="w-9 h-9 object-cover rounded-sm flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[var(--fg)] truncate">{p.name}</div>
                      {p.brand && (
                        <div className="font-mono text-[10px] text-[var(--muted)] truncate">{p.brand}</div>
                      )}
                    </div>
                    {loggedIn ? (
                      <button
                        onClick={() => handleAddProduct(p)}
                        disabled={adding === p.barcode}
                        className="font-mono text-[10px] uppercase tracking-widest border border-[var(--accent)] px-3 py-1.5 rounded-sm text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
                      >
                        {adding === p.barcode ? 'Adding…' : 'Add'}
                      </button>
                    ) : (
                      <Link
                        href="/login"
                        className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                      >
                        Log in to add
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="font-mono text-[12px] text-[var(--muted)] uppercase tracking-widest">
            {!query
              ? 'Enter a search term or barcode'
              : isBarcode(query)
                ? 'No product found for this barcode'
                : 'No results found'}
          </p>
          {query && isBarcode(query) && (
            <p className="font-mono text-[10px] text-[var(--muted)] mt-2 normal-case tracking-normal">
              It isn’t in the system yet and we couldn’t find it in the global product database.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
