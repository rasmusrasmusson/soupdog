# Soupdog — Handover to next chat (2026-06-30)

Paste this at the start of the next chat. It carries the working conventions + exactly
where we are. (The big standing doc is HANDOVER.md in the project; this is the delta +
how-to-work-together.)

## WHO / WHAT
Solo founder Rasmus. Soupdog (soup.dog) — graph-native cooking platform; recipes are
executable DAGs (the graph is the moat). Next.js 16 / TypeScript / Tailwind v4 /
Supabase (project npvajzgciuykugqxedmm) / Vercel (auto-deploy on push to main, syd1).
Repo: github.com/rasmusrasmusson/soupdog, branch main. Local:
E:\OneDrive LW personal\LeWorks\Soupdog - site\2026\soupdog  (referred to as E:\soupdog).
Works from China via Clash Verge TUN-mode VPN. NO real users yet (safe to change/delete).
Rasmus person id b6a30271-7992-406e-8578-da6e2ccf9f19. Admin ACCOUNT ids (use these for
admin gating, NOT the person id): bb02ae50-436c-4402-8c8c-447344e10151 (rr@varm.io),
1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf (rr@le.works).

## HOW WE WORK (conventions — follow these)
- **File delivery:** Claude delivers COMPLETE drop-in files, filenames use `--` as path
  separators (e.g. `src--app--my--recipes--import--page.tsx` → `src/app/my/recipes/import/page.tsx`;
  `docs--Name.md` → `docs/Name.md`). The LAST `--` before `route.ts`/`page.tsx` is still a
  folder separator. Bracket paths like `[slug]` stay literal. Rasmus extracts + places
  manually in Explorer — NEVER PowerShell in-place edits on TSX (corrupts them).
- **Each file's first-line comment states its real path** for placement verification.
- **Minimal delivery:** only the files that changed. Don't re-ship untouched files.
- **NEVER deliver a whole shared type file (`src/types/index.ts`) from a snapshot** — it
  drifts and silently drops fields the live code uses (cost us several red deploys this
  session: SubRecipeRef.expandByDefault/steps, RecipeStep.firstIngredientName). If a type
  needs a field, give Rasmus the ONE-LINE addition to make by hand, OR ask for the current
  file first and edit that exact copy.
- **SQL:** delivered as a migration file; Rasmus runs it MANUALLY in the Supabase SQL editor,
  ONE STATEMENT AT A TIME (autocommit, no BEGIN; multi-statement blocks error 42601).
  **Run the migration BEFORE testing the save** (missing column = save 500; bit us twice).
  Every new table/column needs BOTH a grant AND (for tables) an RLS policy; re-grant after
  adding a column (column-level grants ignore a plain table grant).
- **Build + push (Rasmus runs in PowerShell at E:\soupdog):**
  ```
  cd "E:\soupdog"
  npm run build            # ALWAYS build locally before pushing — catches type errors
  # if green:
  Remove-Item Env:NODE_EXTRA_CA_CERTS -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
  Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
  git remote set-url origin https://github.com/rasmusrasmusson/soupdog.git
  git add -A
  git commit -m "..."
  git push origin main
  git status               # confirm "up to date" — silent push failures happen on the VPN
  ```
  Clash Verge TUN mode must be ON. Silent push fail / SSL-TLS handshake errors = VPN, retry.
- **Claude should ONLY give push code when there's a genuinely new file that turn** — not
  reflexively every turn. Say what the new file is.
- **STALE BROWSER BUNDLE is the #1 recurring trap.** When a fix "didn't take," suspect the
  cache BEFORE re-engineering. Hard-refresh (Ctrl+Shift+R) is often NOT enough for Next.js
  chunks — use **incognito** or DevTools → **Disable cache**. This masked working fixes
  multiple times this session.
- **Claude verifies before delivering:** trace current code → additive edits → brace/paren
  balance (node one-liner) → esbuild/tsc parse-check. Local `npm run build` is the real gate.
- **Design-before-build for anything spine-touching.** Name the seam, don't build the
  abstraction yet. Build in the right order to minimize rework. Claude is the honest
  counterweight: push back on scope-sprawl, flag when the revenue track is neglected, give
  honest trade-offs — don't just continue automatically. DON'T fire blind fixes; when
  oscillating between theories, STOP and get data.
- **Claude's working copy lives in /home/claude/outputs.** Snapshots in /home/claude/src_new
  (and the uploaded src.zip → live_src this session) are the LIVE source — but src_new is
  STALE for some routes (decompose, decompose-save). When unsure whether a snapshot is
  current, ask Rasmus to upload a fresh src.zip and edit against THAT.

## STACK NOTES / GOTCHAS (carried)
- `(supabase as any)` cast pattern throughout routes (stale generated types). `createClient`
  from `@/lib/supabase/server`.
- Recipe data: `recipe_canonicals` (composition_level ≈ kind, is_published, author_id) →
  `recipe_versions` → `version_steps` (task_id, appliance_settings JSONB). Steps reference
  ingredients BY NAME in the parse layer. `recipes` is a flat MIRROR table linked via
  `recipe_version_id` (NOT canonical_id — that's an inert self-FK); delete mirror rows first
  in teardowns. `execution_variants` has NO canonical_id column.
- AI: Haiku for volume/cost, Sonnet for quality. All AI calls route through
  `src/lib/ai/anthropic.ts` (the quota-enforcement seam, when built).
- TWO recipe renderers that DRIFT: `RecipeDisplay.tsx` (web, has mobile + desktop layouts)
  and `RecipePrintLayout.tsx` (PDF). They must be kept in sync — this session the PDF was
  missing served + linked-dish sections the web had. Audit for other drift later.

## WHAT SHIPPED & VERIFIED THIS SESSION (all live)
1. **Multi-made-dish compose** — a meal with 2+ cooked dishes keeps ALL dishes. Root fix:
   `forceGenerate` flag on /api/recipes/generate (meal compose was calling the butler
   CLASSIFIER per dish; it only returns recipeText for the GENERATE action, so dishes that
   matched existing recipes returned `existing` → no text → silently dropped). Also
   `skipExisting` flag fixed "Make a new one anyway" (was an ignored text hint).
2. **Served-not-made** — curated don't-make list (`src/lib/served-items.ts`) marks
   off-the-shelf items (coke, sodas, bottled/sparkling water, commercial spirits) as SERVED
   (skip generation). Conservative: lemonade/homemade lemonade still MADE. Renders "Served
   alongside (ready-made)" on web AND PDF. Persists via `recipe_versions.served_items jsonb`
   (migration run). Decompose-save writes it; recipe page reads it.
3. **Bug 2a (meal meta)** — a multi-dish meal no longer borrows one dish's
   description/cuisine/tags (was showing "AMERICAN · a classic beef burger" for a
   burger+fries+coke meal). Blanked when total dishes (made+linked+served) > 1.
4. **PDF linked-dish + served sections** — RecipePrintLayout now renders "Dishes in this
   meal" (linked) and "Served alongside" (served), which were web-only.
5. **Bug 2b RESOLVED (not data loss)** — cobb salad "vanishing" was: it's a LINKED dish (you
   have a Cobb Salad recipe; loose substring match linked it), rendered fine on web, just
   missing from the PDF. Fixed by #4.

## THE ONE OPEN THING — UNIFIED MEAL GRAPH (the moat-level next build)
**Current state:** meals compose CORRECTLY but SILOED — Hamburger fully, then Fries fully;
no cross-dish task mixing, no shared-prep merge, no parallelism. Rasmus correctly wants the
tasks MIXED for the most logical way to make the whole meal (chop shared prep once, run
parallel chains, interleave by time) — that's the executable-graph moat.

**What happened:** the siloed version (per-dish decompose + namespaced concat) is what's LIVE
now and renders correctly. We ATTEMPTED the unified graph (per-dish parse → ONE decompose over
a combined multi-group extraction; the decompose engine is built for this — its prompt rules
4/5/6b merge shared prep + keep parallel chains). It KEPT all dishes but produced a MALFORMED
chicken group on "roast chicken + mashed potatoes + steamed green beans" — chicken's cooking
steps lost ingredient/tool bindings and rendered as a bare numbered list ("Add", "Season",
"Season"...), while mash+beans were fine. **Reverted to the working siloed version.**

**Leading (UNCONFIRMED) hypothesis:** cross-dish INGREDIENT COLLISION. Concatenating each
fully-parsed dish's ingredients[] makes duplicates across dishes (this meal: potatoes in BOTH
the roast and the mash; salt/oil/pepper everywhere). The engine's shared-prep merge (rule 6b)
likely reassigned/merged the dups and detached the chicken's steps from their ingredients.
The engine expects ONE coherent ingredient list, not N recipes' lists stapled together.

**NEXT SESSION — do this, in order (DATA FIRST, no blind fix attempt #3):**
1. Compose "roast chicken with mashed potatoes and steamed green beans". With DevTools
   Network open ON the import page, filter "decompose", click Compose, open the `decompose`
   request → Response → capture `dag.nodes`. Confirm whether chicken nodes lost ingredient
   links and how duplicate potatoes/salt/oil were handled.
2. THEN pick a fix (candidates in docs/Soupdog_Unified_Meal_Graph_Design_v0_1.md §10):
   (a) DEDUPE the combined ingredient list before decompose (most likely);
   (b) generate ONE meal TEXT, parse once, teach the parser to keep dishes as groups;
   (c) per-dish decompose + a second cross-dish merge pass.
3. Fix the INPUT SHAPE we feed decompose, not the engine (the engine handles multi-group).
Full design + the reverted-attempt writeup: docs/Soupdog_Unified_Meal_Graph_Design_v0_1.md.

## OTHER PARKED / BACKLOG (unchanged)
- Time-threshold guardrail (the OTHER served-not-made mechanism: ask user when from-scratch
  time exceeds a user-set threshold) — Front_Door design §13.1, not built.
- Fuller recipe-visibility model (hidden_product value, serve/finish stubs, ownership
  transfer to manufacturers) — Recipe_Visibility design §1–10, schema deferred.
- Meal-level auto-description for multi-dish meals (currently blank until user writes one).
- Renderer drift audit (RecipeDisplay vs RecipePrintLayout) — what else does web show that
  the PDF doesn't (nutrition? who's-eating line?).
- Revenue track (Stripe enforcement gate, quota, checkout, webhook) — repeatedly flagged as
  neglected; no paying users or enforcement exists. The single gate is src/lib/ai/anthropic.ts.
- DAG-native editor (27 read-only recipes); content work-order system; etc. — see HANDOVER.md.

## DESIGN DOCS PRODUCED THIS SESSION (in docs/)
- Soupdog_Multi_Made_Dish_Compose_Design_v0_1.md (DONE — forceGenerate fix)
- Soupdog_Recipe_Visibility_And_Ownership_Design_v0_1.md (§11 reconciliation, §12–14
  served-not-made slice complete)
- Soupdog_Unified_Meal_Graph_Design_v0_1.md (the OPEN one — §3 approach, §10 attempt+revert)
