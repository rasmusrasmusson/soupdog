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

**File delivery pattern:** Claude zips files, user downloads, extracts, and replaces manually in Explorer. Never use PowerShell `Set-Content` or `WriteAllLines` to edit TSX files — corrupts them.

---

## Platform Vision

Soupdog is not a recipe website. It is a **food execution platform** — a structured knowledge graph of food, processes, and tools that AI can reason over.

**The graph is the moat. The AI is the interface.**

Long-term goals: software-defined food preparation, appliance-specific execution profiles, commercial kitchen optimisation, personalised nutrition at household level.

---

## What's Working (as of 2026-05-31)

### Public
- Public recipe browsing at `/recipes`
- Recipe pages at `/recipes/[slug]` — structured tables, ingredient pill toggles per step, nutrition section
- Search at `/search` — full-text, type filters, barcode lookup
- Authentication (email login via Supabase Auth)

### My Recipes (`/my/recipes`)
- Single "Add recipe" button → goes to import page
- Created/Saved tabs, draft/published status, publish toggle
- Delete with inline Cancel/Delete confirm buttons
- Preview (ExternalLink icon) for both draft and published recipes
- Success banners via sessionStorage (saved/published) — show once, clear on return

### Add Recipe (`/my/recipes/import`) — Basic mode
- Paste text OR upload JPG/PNG/WebP/PDF/TXT (up to 20MB)
- Optional recipe name field at top
- Auto-import on file drop (no extra click)
- Claude (Sonnet) parses into atomic steps
- Preview shows WYSIWYG recipe with editable title, description, cuisine, difficulty, tags
- Chat panel (right side) — Haiku for questions, Sonnet for modifications, streaming responses
- "Save recipe" → saves draft → redirects to My Recipes with banner
- "Advanced editor →" link for admins

### Basic Edit (`/my/recipes/[id]`) — WYSIWYG
- Loads recipe in view-mode style (meta grid, ingredients table, steps table)
- Editable: title (inline), cuisine, difficulty, servings directly in meta grid
- Chat panel right sidebar — live updates recipe as AI makes changes
- "Advanced editor →" link in breadcrumb
- Save recipe button (fixed bottom bar, clears sidebar)
- Edit badge: "Draft · editing" or "Published · editing"
- Chat intro: explains fields are directly editable

### Advanced Editor (`/my/recipes/[id]/edit`)
- Full RecipeEditor form (~2600 lines)
- Fixed right sidebar chat panel (300px)
- Save bar stops at sidebar (right: 300px)
- Ingredient pills with expand-to-edit for qty/unit/prep
- Tool badges use SoupdogIcon "tools" (custom SVG, not Lucide)
- Streaming responses, Haiku/Sonnet routing

### Recipe View (`/recipes/[slug]`)
- Authors can view own drafts (amber banner + "Publish recipe" button)
- After publish → redirects to My Recipes with published banner
- Nutrition section shows when ingredients have USDA data

---

## AI Chat System

### Architecture
- Route: `src/app/api/recipes/import/chat/route.ts`
- **Haiku** for questions/answers (fast, cheap)
- **Sonnet** for modifications (accurate)
- Streaming SSE — text streams word-by-word, JSON hidden during modifications
- `requiresConfirmation: true` for large changes → Apply/Cancel buttons
- Scope: food, cooking, nutrition, appliances, Soupdog platform questions only
- `max_tokens: 8000` for modifications

### Chat used on:
- `/my/recipes/import` — import preview chat
- `/my/recipes/[id]` — basic edit chat
- `/my/recipes/[id]/edit` — advanced editor chat

---

## Nutrition System

### Auto-estimation
When a new ingredient is created (POST or PUT recipe save), Claude Haiku estimates USDA nutrition per 100g and saves to `ingredients.nutrition_per_100g`.

Function `estimateNutrition(name)` exists in both:
- `src/app/api/my/recipes/route.ts`
- `src/app/api/my/recipes/[id]/route.ts`

### Backfill endpoint
`POST /api/admin/backfill-nutrition` — processes 30 ingredients per call, single batched Haiku request. Call from browser console while logged in:
```javascript
fetch('/api/admin/backfill-nutrition', { method: 'POST' }).then(r => r.json()).then(console.log)
```
Call repeatedly until `remaining: 0`.

### Known nutrition gaps
- `pasta water` — marked `is_product = true` to exclude from nutrition checks
- Taxonomy category nodes ("Dairy", "Grains & Pasta" etc.) — marked `is_product = true`
- Nutrition only shows in view page when `confidence !== 'insufficient'` and `calories > 0`

---

## Schema (v3/v4/v5 — current)

### Key tables
| Table | Purpose |
|---|---|
| `recipe_canonicals` | Stable identity. Slug, author, published state. |
| `recipe_versions` | Versioned content. `version_number` must increment (unique constraint on canonical_id + version_number, default 1). |
| `version_steps` | Steps with task_id FK, `appliance_settings` JSONB (stores taskId, taskName, taskFamily, stepTools, groupToolInstances). |
| `version_ingredients` | Per-version ingredients with `step_id` FK. Step ingredients linked here, NOT in appliance_settings. |
| `tasks` | Atomic task library. family, task_type, suggested_tool_slugs. |
| `ingredients` | Unified ingredient + product table. `is_product` flag, `nutrition_per_100g` JSONB, barcode, brand. |
| `equipment` | Equipment taxonomy. |

### Important: step ingredients storage
Step ingredients are stored in `version_ingredients` with a `step_id` FK — **NOT** in `appliance_settings`. The GET `/api/my/recipes/[id]` builds `stepIngredients` by joining `version_ingredients` filtered by `step_id`.

### Group labels
`__default__` is an internal sentinel — always strip before saving to DB:
```typescript
group_label: (step.groupLabel?.trim() === '__default__' ? null : step.groupLabel?.trim()) || null
```

### version_number
Must be provided on insert — get next number first:
```typescript
const { data: existing } = await db.from('recipe_versions')
  .select('version_number').eq('canonical_id', id)
  .order('version_number', { ascending: false }).limit(1);
const nextVersion = ((existing?.[0]?.version_number) ?? 0) + 1;
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/my/recipes` | GET/POST | List (from recipe_canonicals) + create recipes |
| `/api/my/recipes/[id]` | GET/PUT/DELETE | Load/update/delete recipe |
| `/api/my/recipes/[id]/publish` | PATCH | Toggle published — updates both recipe_canonicals AND recipes by slug |
| `/api/recipes/import` | POST | Claude parsing — accepts `{text}` OR `{file, mediaType}` |
| `/api/recipes/import/chat` | POST | Streaming SSE chat — Haiku/Sonnet routing |
| `/api/admin/backfill-nutrition` | POST | Backfill nutrition for ingredients missing data |
| `/api/ingredients/search` | GET | Ingredient autocomplete |
| `/api/recipes/[id]/nutrition` | GET | Nutrition estimate |
| `/api/tasks` | GET/POST | Task library |
| `/api/ingredients/tree` | GET | Ingredient taxonomy tree |
| `/api/equipment/tree` | GET | Equipment taxonomy tree |

**Anthropic models:**
- Questions/answers: `claude-haiku-4-5-20251001`
- Modifications/parsing: `claude-sonnet-4-6`
- **API key:** Set in Vercel env as `ANTHROPIC_API_KEY`

---

## Delete Flow (important)

Delete must remove from `recipes` table FIRST (FK constraint), then `recipe_canonicals`:
```typescript
await db.from('recipes').delete().eq('slug', canonical.slug);
await db.from('recipe_canonicals').delete().eq('id', id).eq('author_id', user.id);
```

The GET `/api/my/recipes` queries `recipe_canonicals` and returns canonical IDs as `r.id`. These are the correct IDs to use for delete and publish.

---

## Publish Flow

The publish API (`/api/my/recipes/[id]/publish`) updates both tables:
1. `recipe_canonicals` by canonical id
2. `recipes` by slug (legacy mirror)

After publishing from recipe view page → sets `sessionStorage.setItem('soupdog_published', title)` → redirects to `/my/recipes` → banner shows once and clears.

---

## Known Issues / Technical Debt

1. **Stale Supabase types** — `src/lib/supabase/types.ts` is pre-v3. All new queries use `(supabase as any)`. Fix: `npx supabase gen types typescript --project-id npvajzgciuykugqxedmm > src/lib/supabase/types.ts` (run locally with VPN).

2. **Google OAuth in test mode** — Needs publishing in Google Cloud Console for production.

3. **Legacy mirror dependency** — Public recipe pages query `recipes` table first, then fall back to `recipe_canonicals`. New recipes auto-mirror to both.

4. **Async nutrition on save** — Currently `estimateNutrition()` is awaited during recipe save, adding ~1s latency per new ingredient. Should be made async (fire and forget) to keep saves fast.

5. **RLS on recipes table** — Draft recipes not visible to authors via public query due to RLS. Currently handled by querying without `is_published` filter and checking `author_id` in code, but RLS may still block in some cases.

---

## Next Priority Features

### Priority 1 — Usage tracking (Option D)
Log AI calls per user to Supabase `ai_usage_log` table: user_id, timestamp, model, input_tokens, output_tokens, feature. Foundation for membership tiers.

### Priority 2 — DOCX + Excel upload (Batch 2)
Support Word documents and Excel files on import page. Excel needs `xlsx` npm package for conversion to CSV/text before passing to Claude.

### Priority 3 — Edit flow routing
Currently pencil icon on My Recipes → basic edit (`/my/recipes/[id]`). Advanced editor at `/my/recipes/[id]/edit`. This routing is correct. The `new` page (`/my/recipes/new`) is the legacy form-only editor, still accessible via "Advanced editor →" link.

### Priority 4 — Public ingredient browse
`/ingredients` taxonomy tree navigation. Nodes seeded (g- prefix), just needs UI.

### Priority 5 — Servings scaling
Servings stepper → creates `execution_variant` with AI-scaled quantities (non-linear: spices at ~0.7x etc).

### Priority 6 — Entity relations seeding
Seed `entity_relations` with ingredient substitutions, flavour affinities, equipment equivalences.

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

Fixed bottom bar pattern:
```tsx
<div style={{ position: 'fixed', bottom: 0, left: 0, right: 300, borderTop: B, background: 'var(--surface)', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
```
Note: `right: 300` accounts for fixed chat sidebar on edit pages.

---

## Key File Map

| File | Purpose |
|---|---|
| `src/app/recipes/[slug]/page.tsx` | Recipe view page — draft preview for authors, publish button |
| `src/app/my/recipes/page.tsx` | My Recipes — single Add recipe button, delete/publish/preview actions |
| `src/app/my/recipes/import/page.tsx` | Add Recipe (basic) — upload/paste, AI parse, WYSIWYG preview, chat |
| `src/app/my/recipes/[id]/page.tsx` | Basic edit — WYSIWYG view + chat panel, editable meta fields |
| `src/app/my/recipes/[id]/edit/page.tsx` | Advanced editor — full RecipeEditor + right sidebar chat |
| `src/app/my/recipes/new/page.tsx` | Legacy form editor (still works, linked as "Advanced editor") |
| `src/app/api/recipes/import/route.ts` | Claude atomic-step parsing — accepts text or base64 file |
| `src/app/api/recipes/import/chat/route.ts` | Streaming SSE chat — Haiku/Sonnet, scope-limited to food/Soupdog |
| `src/app/api/my/recipes/route.ts` | GET list + POST create — includes estimateNutrition, findOrCreateIngredient |
| `src/app/api/my/recipes/[id]/route.ts` | GET/PUT/DELETE — step ingredients from version_ingredients, version_number increment |
| `src/app/api/my/recipes/[id]/publish/route.ts` | PATCH publish — updates canonicals + recipes by slug |
| `src/app/api/admin/backfill-nutrition/route.ts` | One-time backfill — batched Haiku nutrition estimation |
| `src/components/recipe/RecipeEditor.tsx` | Shared editor (~2600 lines) — ingredient pills, SoupdogIcon for tools |
| `src/components/icons/SoupdogIcon.tsx` | Custom SVG icons — use `name="tools"` for tool icons everywhere |
| `src/lib/supabase/types.ts` | **STALE** — needs regeneration |
