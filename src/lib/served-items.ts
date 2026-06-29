// src/lib/served-items.ts
// Curated "don't-make" list: obviously off-the-shelf / ready-made products that should be
// SERVED (included in a meal as-is), never given a generated recipe. When meal compose sees
// a dish matching this list, it marks it served and skips the wasted generation call.
//
// SEAM (not built yet): this is a hardcoded list for now. The future recipe-visibility model
// (hidden_product) will let these resolve to real catalogue products with a manufacturer
// recipe that may be hidden. Until then, a simple curated matcher does the job. The user can
// always override by adding their own recipe for an item.

// Normalised matching: lowercase, strip punctuation, collapse whitespace.
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Keyword fragments that mark a dish as ready-made. Matched as whole-word-ish substrings of
// the normalised name. Kept deliberately CONSERVATIVE — only obviously-bought items, so we
// never wrongly refuse to cook something. (e.g. "lemonade" is omitted: people DO make it.)
const SERVED_KEYWORDS: string[] = [
  // soft drinks / sodas (brands + generic)
  'coke', 'coca cola', 'coca-cola', 'pepsi', 'sprite', 'fanta', '7up', '7 up', 'dr pepper',
  'mountain dew', 'soda', 'soft drink', 'cola', 'root beer', 'ginger ale', 'tonic water',
  'club soda', 'sparkling water', 'mineral water', 'bottled water', 'energy drink',
  'red bull', 'gatorade', 'powerade',
  // commercial spirits / beers / mixers (the bottle itself, not a cocktail)
  'bottle of wine', 'can of beer', 'bottle of beer', 'lager', 'pilsner',
  // packaged / branded staples bought ready-made
  'bag of crisps', 'packet of crisps', 'bag of chips', 'potato chips',
];

// Exact-name short-circuits for very common cases (still matched via keywords below, but
// listed for clarity / future tuning).
const SERVED_EXACT: Set<string> = new Set([
  'coke', 'coca cola', 'pepsi', 'sprite', 'fanta', 'water', 'sparkling water', 'soda',
]);

/**
 * Is this dish an obviously ready-made / off-the-shelf item that should be SERVED, not made?
 * Conservative on purpose — false negatives (we try to make it) are safer than false
 * positives (we refuse to cook something the user wanted made).
 */
export function isServedItem(name: string): boolean {
  const n = norm(name);
  if (!n) return false;
  if (SERVED_EXACT.has(n)) return true;
  return SERVED_KEYWORDS.some(kw => {
    const k = norm(kw);
    // whole-word-ish: the keyword appears as a token boundary in the name
    return n === k || n.includes(' ' + k) || n.includes(k + ' ') || n.startsWith(k + ' ') || n.endsWith(' ' + k) || n === k;
  });
}
