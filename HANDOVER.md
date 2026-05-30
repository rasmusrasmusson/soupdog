# Soupdog Development Handover
**Project:** Soupdog (soup.dog) — food execution platform  
**Repo:** github.com/rasmusrasmusson/soupdog  
**Stack:** Next.js 16, React, TypeScript, Tailwind CSS v4, Supabase, Vercel  
**Working directory:** `E:\OneDrive LW personal\LeWorks\Soupdog - site\2026\soupdog`  
**Supabase project ID:** npvajzgciuykugqxedmm  

---

## How to start each session (Windows PowerShell)

```powershell
Remove-Item Env:NODE_EXTRA_CA_CERTS -ErrorAction SilentlyContinue
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
cd "E:\OneDrive LW personal\LeWorks\Soupdog - site\2026\soupdog"
```

**GitHub push:** Use HTTPS not SSH (SSH blocked in China):
```powershell
git remote set-url origin https://github.com/rasmusrasmusson/soupdog.git
git push
```

Clash Verge must have TUN Mode ON. VPN required for Anthropic API and GitHub.

---

## Platform Vision

Soupdog is not a recipe website. It is a **food execution platform** — a structured knowledge graph of food, processes, and tools that AI can reason over.

**The graph is the moat. The AI is the interface.**

Long-term goals: software-defined food preparation, appliance-specific execution profiles, commercial kitchen optimisation, personalised nutrition at household level.

---

## What's Working (as of 2026-05-30)

- Public recipe browsing at `/recipes`
- Recipe pages at `/recipes/[slug]` — structured tables, ingredient pill toggles per step
- Search at `/search` — full-text, type filters, barcode lookup, All filter default
- Authentication (email login via Supabase Auth)
- My Recipes at `/my/recipes` — tabbed Saved/Created, draft/published, Import + New recipe buttons
- Recipe creation at `/my/recipes/new` — full structured editor (Groups → Steps → Tasks → Tools → Ingredients)
- Recipe edit at `/my/recipes/[id]/edit`
- **AI Recipe Import at `/my/recipes/import`** — paste any recipe text → Claude parses into atomic steps with ingredients, tools, task families → preview → open in editor
- Unified ingredient/product system — `ingredients` table with `is_product` flag, `/ingredients/[slug]`
- Barcode lookup via Open Food Facts at `/my/ingredients/new`
- Grocery taxonomy seeded (~80 nodes, `g-` prefixed slugs)
- Task library seeded (~40 global tasks across 8 families)
- Custom icons throughout (SoupdogIcon component)
- Units: g, kg, ml, l, tsp, tbsp, cup, oz, lb, clove, slice, piece, pinch, **bunch, to taste, as needed**

---

## AI Import System (built this session)

### Flow
1. User goes to `/my/recipes/import`
2. Pastes recipe text (any language, any format)
3. Claude (claude-sonnet-4-6) parses into structured JSON with **atomic steps** (one action = one step)
4. Preview page shows parsed recipe with ingredients, steps, task families, tools, timings
5. "Open in editor" → pre-fills RecipeEditor with tasks pre-selected, tool instances built
6. User reviews/adjusts → saves

### Key files
| File | Purpose |
|---|---|
| `src/app/my/recipes/import/page.tsx` | Import UI — paste, preview, fixed bottom bar |
| `src/app/api/recipes/import/route.ts` | Claude parsing API — atomic step prompt |
| `src/app/my/recipes/new/page.tsx` | Receives import data from sessionStorage, converts to editor format |

### Import prompt principles
- One atomic action = one step ("Fill pot with water", not "Bring salted water to boil")
- `stepTools` required on almost every step — consistent names across steps (same physical tool = same string)
- Implied ingredients included (water, oil, salt for pasta water)
- Task family assigned to every step
- Groups reflect recipe sections (Pasta, Sauce, Assembly, etc.)

### familyMap (hardcoded task IDs for pre-selection)
```
cut:          31132714-14a6-4f36-984a-308683d059bb  (Brunoise)
finish:       a9574682-9da1-4da8-a130-fe6ac78d7b06  (Deglaze)
heat_dry:     4a6f0b2d-7679-4b03-8983-1ad41ccb5e2b  (Bake)
heat_machine: 3c2ec27b-2c93-4363-a322-a5180c21af72  (Combi steam)
heat_wet:     2f600f22-57f9-4d86-abbd-f06146a50626  (Blanch)
mix:          cdc58767-e42a-4206-9c27-2c82e3fdc395  (Beat)
move:         45b0f2b6-7897-4b28-91a8-03f5a43dbc10  (Add)
passive:      193d41a3-521c-41c0-88f5-e44a48005d2e  (Brine)
prepare:      24a9b746-e572-41e2-b601-cdfad7850c33  (Measure)
```

---

## Schema (v3/v4/v5 — current)

Migrations applied:
- `supabase/migration_v3_foundation.sql` — knowledge graph foundation
- `supabase/migration_v4_consolidate_products.sql` — products merged into ingredients
- `supabase/migration_v5_drop_cooking_profiles.sql` — dropped product_cooking_profiles

### Key tables
| Table | Purpose |
|---|---|
| `recipe_canonicals` | Stable identity. Slug, author, published state. |
| `recipe_versions` | Immutable versioned content. |
| `version_steps` | Steps with task_id FK, appliance_settings JSONB. |
| `version_ingredients` | Per-version ingredients with step_id FK. |
| `execution_variants` | Parameterised variants: servings, appliance, food state. |
| `tasks` | Atomic task library. family, task_type, suggested_tool_slugs. |
| `entity_relations` | Weighted knowledge graph edges. |
| `ingredients` | Unified ingredient + product table. `is_product` flag, barcode, brand. |
| `equipment` | Equipment taxonomy. |

### Views
| View | Purpose |
|---|---|
| `search_index` | Full-text search. Re-grant after recreation. |
| `coverage_matrix` | Product × appliance content KPI. |

**After any view recreation:**
```sql
grant select on search_index to anon, authenticated;
grant select on coverage_matrix to anon, authenticated;
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/my/recipes` | GET/POST | List + create recipes |
| `/api/my/recipes/[id]` | GET/PUT/DELETE | Load/update/delete recipe |
| `/api/my/recipes/[id]/publish` | PATCH | Toggle published |
| `/api/my/ingredients` | GET/POST | List + create ingredients/products |
| `/api/my/products/[id]` | GET/PUT/DELETE | Manage product |
| `/api/products/lookup` | GET | OFF barcode/name lookup |
| `/api/ingredients/search` | GET | Search ingredients |
| `/api/ingredients/[slug]` | GET | Ingredient detail + linkedRecipes |
| `/api/recipes/import` | POST | Claude recipe parsing |
| `/api/tasks` | GET/POST | Task library |
| `/api/ingredients/tree` | GET | Ingredient taxonomy tree |
| `/api/equipment/tree` | GET | Equipment taxonomy tree |
| `/api/recipes/[id]/nutrition` | GET | Nutrition estimate |

**Anthropic model:** `claude-sonnet-4-6`  
**API key:** Set in Vercel env as `ANTHROPIC_API_KEY`

---

## Known Issues / Technical Debt

1. **Stale Supabase types** — `src/lib/supabase/types.ts` is pre-v3. All new queries use `(supabase as any)`. Fix: `npx supabase gen types typescript --project-id npvajzgciuykugqxedmm > src/lib/supabase/types.ts` (run locally with VPN).

2. **Debug line in import preview** — `src/app/my/recipes/import/page.tsx` has a "Debug step 1 tools:" line that must be removed before going public.

3. **Tool labeling in editor on import** — Imported tools show as freetext ("large pot") not labeled instances ("Pot #1") on initial load. Auto-labels when user clicks the tool. Low priority since most users won't use form editor.

4. **Google OAuth in test mode** — Needs publishing in Google Cloud Console for production.

5. **Legacy mirror dependency** — Public recipe pages query `recipes` table. New recipes auto-mirror. Older seed recipes may need manual SQL.

---

## Next Priority Features

### Immediate
- **Remove debug line** from `src/app/my/recipes/import/page.tsx` (search for "Debug step 1 tools")
- **Regenerate Supabase types** (run locally with VPN)

### Priority 1 — AI chat in recipe view/edit
Conversational recipe editor. User describes changes in natural language, Claude updates the structured recipe JSON and re-renders. This is the primary editing interface vision.

- View page: floating chat input → Claude reads current recipe JSON + user message → returns updated JSON → re-renders
- Edit page: same chat panel alongside the form editor
- Form editor becomes "Advanced mode" toggle — may be restricted to certain users to ensure quality
- Full conversation history in state for multi-turn context

### Priority 2 — Entity relations seeding
Seed `entity_relations` with ingredient substitutions, flavour affinities, equipment equivalences. AI-assisted seeding with confidence 0.4, human review queue.

### Priority 3 — Public ingredient browse
`/ingredients` taxonomy tree navigation. Nodes seeded, just needs UI.

### Priority 4 — Variant authoring
Axis-driven variant creation. Servings stepper → proper variant selector.

---

## Design System

| Token | Value |
|---|---|
| Background | `#f7f6f2` warm off-white |
| Accent | `#2e4638` dark olive green |
| Muted | `#6b6860` |
| Border | `#dad7d1` |
| Display font | IBM Plex Serif |
| Mono font | IBM Plex Mono |

CSS vars: `--bg`, `--fg`, `--accent`, `--muted`, `--border`, `--surface`, `--surface-hover`, `--accent-subtle`

Fixed bottom bar pattern (used on edit, new, import pages):
```tsx
<div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
```

---

## Key File Map

| File | Purpose |
|---|---|
| `src/app/recipes/[slug]/page.tsx` | Recipe view page |
| `src/app/my/recipes/page.tsx` | My Recipes — Import + New recipe buttons |
| `src/app/my/recipes/new/page.tsx` | New recipe + import receiver with familyMap |
| `src/app/my/recipes/import/page.tsx` | AI import page — paste, preview, fixed bar |
| `src/app/my/recipes/[id]/edit/page.tsx` | Recipe edit page |
| `src/app/api/recipes/import/route.ts` | Claude atomic-step parsing prompt |
| `src/app/api/my/recipes/route.ts` | POST with findOrCreateIngredient |
| `src/components/recipe/RecipeEditor.tsx` | Shared editor (~2500 lines) |
| `src/components/icons/SoupdogIcon.tsx` | Custom SVG icons |
| `src/components/layout/Sidebar.tsx` | Nav with custom icons |
| `src/lib/supabase/types.ts` | **STALE** — needs regeneration |
| `supabase/migration_v3_foundation.sql` | Knowledge graph schema |
| `supabase/migration_v4_consolidate_products.sql` | Products → ingredients merge |
| `supabase/seed_grocery_taxonomy_v2.sql` | ~80 grocery taxonomy nodes (g- prefix) |
| `supabase/seed_tasks.sql` | ~40 global tasks |

<!-- build: 2026-05-30 19:03 -->
