// src/app/api/products/lookup/route.ts
// Server-side Open Food Facts barcode/name lookup
// GET /api/products/lookup?barcode=5000112637922
// GET /api/products/lookup?name=dr+oetker+ristorante

import { NextRequest, NextResponse } from 'next/server';

interface OFFProduct {
  code: string;
  product: {
    product_name?: string;
    brands?: string;
    quantity?: string;
    nutriments?: Record<string, number>;
    allergens_tags?: string[];
    ingredients_text?: string;
    image_url?: string;
    categories_tags?: string[];
    countries_tags?: string[];
    packaging?: string;
  };
  status: number;
  status_verbose: string;
}

function parseNutrition(n: Record<string, number> | undefined) {
  if (!n) return null;
  return {
    calories:       n['energy-kcal_100g'] ?? n['energy_100g'] ? Math.round((n['energy_100g'] ?? 0) / 4.184) : undefined,
    fat:            n['fat_100g'],
    saturated_fat:  n['saturated-fat_100g'],
    carbohydrates:  n['carbohydrates_100g'],
    sugar:          n['sugars_100g'],
    fiber:          n['fiber_100g'],
    protein:        n['proteins_100g'],
    sodium:         n['sodium_100g'] ? n['sodium_100g'] * 1000 : undefined, // convert to mg
    salt:           n['salt_100g'],
  };
}

function parseWeight(quantity: string | undefined): number | null {
  if (!quantity) return null;
  const match = quantity.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit  = match[2].toLowerCase();
  if (unit === 'kg') return value * 1000;
  if (unit === 'l')  return value * 1000;
  return value;
}

function parsePackaging(packaging: string | undefined): string | null {
  if (!packaging) return null;
  const lower = packaging.toLowerCase();
  if (lower.includes('bottle'))  return 'bottle';
  if (lower.includes('can'))     return 'can';
  if (lower.includes('bag'))     return 'bag';
  if (lower.includes('box'))     return 'box';
  if (lower.includes('tray'))    return 'tray';
  if (lower.includes('frozen'))  return 'frozen_bag';
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get('barcode');
  const name    = searchParams.get('name');

  if (!barcode && !name) {
    return NextResponse.json({ error: 'barcode or name required' }, { status: 400 });
  }

  try {
    let url: string;

    if (barcode) {
      // Exact barcode lookup
      url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    } else {
      // Name search — returns list of products
      url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name!)}&search_simple=1&action=process&json=1&page_size=5`;
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Soupdog/1.0 (soup.dog; contact@soup.dog)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Open Food Facts unavailable' }, { status: 502 });
    }

    const data = await res.json();

    // ── Barcode lookup ────────────────────────────────────────
    if (barcode) {
      const off = data as OFFProduct;
      if (off.status === 0) {
        return NextResponse.json({ found: false });
      }
      const p = off.product;
      return NextResponse.json({
        found:       true,
        barcode,
        name:        p.product_name ?? null,
        brand:       p.brands?.split(',')[0].trim() ?? null,
        net_weight_g: parseWeight(p.quantity),
        packaging_type: parsePackaging(p.packaging),
        nutrition_per_100g: parseNutrition(p.nutriments),
        ingredient_list: p.ingredients_text ?? null,
        allergens: (p.allergens_tags ?? []).map((t: string) => t.replace('en:', '')),
        image_url:   p.image_url ?? null,
        off_id:      off.code,
      });
    }

    // ── Name search ───────────────────────────────────────────
    const products = (data.products ?? []).slice(0, 5).map((p: any) => ({
      barcode:     p.code,
      name:        p.product_name ?? null,
      brand:       p.brands?.split(',')[0].trim() ?? null,
      net_weight_g: parseWeight(p.quantity),
      image_url:   p.image_url ?? null,
      off_id:      p.code,
    })).filter((p: any) => p.name);

    return NextResponse.json({ found: products.length > 0, products });

  } catch (err: any) {
    console.error('[OFF lookup]', err);
    return NextResponse.json({ error: 'Lookup failed', detail: err.message }, { status: 500 });
  }
}
