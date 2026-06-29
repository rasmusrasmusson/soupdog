'use client';
// src/app/my/recipes/import/page.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, ArrowLeft, Send, RotateCcw, X, Plus } from 'lucide-react';
import { RecipeDisplay } from '@/components/recipe/RecipeDisplay';
import { dagToRecipe } from '@/lib/dag-to-recipe';
import Link from 'next/link';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

const EXAMPLE = `Spaghetti Carbonara

Serves 4 | 30 minutes

Ingredients:
400g spaghetti
200g guanciale or pancetta, diced
4 large eggs
100g Pecorino Romano, finely grated
50g Parmesan, finely grated
Black pepper, freshly cracked
Salt for pasta water

Method:
1. Bring a large pot of salted water to boil. Cook spaghetti until al dente, about 8-10 minutes.
2. Meanwhile, fry guanciale in a large pan over medium heat until crispy, about 8 minutes. Remove from heat.
3. Whisk eggs with grated cheeses and a generous amount of black pepper.
4. Reserve 200ml pasta water before draining.
5. Add hot pasta to the guanciale pan off the heat. Pour over egg mixture and toss quickly, adding pasta water gradually until creamy.
6. Serve immediately with extra cheese and black pepper.`;

interface ChatTurn {
  type: 'answer' | 'modification';
  user: string;
  recipe: any;
  assistantSummary: string;
}

interface PendingChange {
  recipe: any;
  summary: string;
}

const FAMILY_MAP = new Map<string, any>([
  ['cut',          { id: '31132714-14a6-4f36-984a-308683d059bb', name: 'Brunoise',     family: 'cut',          task_type: 'human'   }],
  ['finish',       { id: 'a9574682-9da1-4da8-a130-fe6ac78d7b06', name: 'Deglaze',     family: 'finish',       task_type: 'human'   }],
  ['heat_dry',     { id: '4a6f0b2d-7679-4b03-8983-1ad41ccb5e2b', name: 'Bake',        family: 'heat_dry',     task_type: 'machine' }],
  ['heat_machine', { id: '3c2ec27b-2c93-4363-a322-a5180c21af72', name: 'Combi steam', family: 'heat_machine', task_type: 'machine' }],
  ['heat_wet',     { id: '2f600f22-57f9-4d86-abbd-f06146a50626', name: 'Blanch',      family: 'heat_wet',     task_type: 'human'   }],
  ['mix',          { id: 'cdc58767-e42a-4206-9c27-2c82e3fdc395', name: 'Beat',        family: 'mix',          task_type: 'human'   }],
  ['move',         { id: '45b0f2b6-7897-4b28-91a8-03f5a43dbc10', name: 'Add',         family: 'move',         task_type: 'human'   }],
  ['passive',      { id: '193d41a3-521c-41c0-88f5-e44a48005d2e', name: 'Brine',       family: 'passive',      task_type: 'passive' }],
  ['prepare',      { id: '24a9b746-e572-41e2-b601-cdfad7850c33', name: 'Measure',     family: 'prepare',      task_type: 'human'   }],
]);

function uid() { return Math.random().toString(36).slice(2, 9); }

// Compose a restaurant-menu-style title from a meal's dish names, joined naturally:
// 1 dish → "Spaghetti aglio e olio"; 2 → "A with B"; 3+ → "A, B, and C".
// The first dish keeps its capitalisation; later dishes are lower-cased at their start
// (a menu reads "Spaghetti aglio e olio with green salad", not "...with Green Salad")
// unless they look like a proper noun (already mixed/upper case beyond the first letter).
function lowerFirstUnlessProper(s: string): string {
  if (!s) return s;
  // if the word after the first has uppercase (proper noun-ish), leave it
  const rest = s.slice(1);
  if (/[A-Z]/.test(rest)) return s;
  return s.charAt(0).toLowerCase() + rest;
}
function composeMenuTitle(names: string[]): string {
  const parts = names.map(n => n.trim()).filter(Boolean);
  if (parts.length === 0) return 'Meal';
  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  const tail = rest.map(lowerFirstUnlessProper);
  if (tail.length === 1) return `${first} with ${tail[0]}`;
  const last = tail.pop() as string;
  return `${first} with ${tail.join(', ')}, and ${last}`;
}

const SHORT_LABELS: Record<string, string> = {
  'stock pot': 'Pot', 'large pot': 'Pot', 'saucepan': 'Pan', 'frying pan': 'Pan',
  'saute pan': 'Pan', 'pan': 'Pan', 'pot': 'Pot', "chef's knife": 'Knife', 'knife': 'Knife',
  'wok': 'Wok', 'blender': 'Blender', 'stand mixer': 'Mixer', 'food processor': 'Processor',
  'oven': 'Oven', 'microwave': 'Microwave', 'mixing bowl': 'Bowl', 'bowl': 'Bowl',
  'whisk': 'Whisk', 'spatula': 'Spatula', 'colander': 'Colander', 'grater': 'Grater',
  'cheese grater': 'Grater', 'chopping board': 'Board', 'cutting board': 'Board',
};

function importToRecipePayload(imp: any): any {
  const allIngredients = imp.ingredients ?? [];
  const usedInSteps    = new Set<string>();
  const assignedToStep = new Set<string>();

  const steps = (imp.groups ?? []).flatMap((group: any) => {
    const toolInstanceMap = new Map<string, any>();
    const toolInstances: any[] = [];
    for (const step of (group.steps ?? [])) {
      for (const toolName of (step.stepTools ?? [])) {
        const key = toolName.toLowerCase().trim();
        if (!toolInstanceMap.has(key)) {
          const base  = SHORT_LABELS[key] ?? toolName;
          const count = toolInstances.filter(t => (SHORT_LABELS[t.name.toLowerCase()] ?? t.name) === base).length;
          const inst  = { instanceId: uid(), equipmentId: '', name: toolName, label: `${base} #${count + 1}`, colorIndex: toolInstances.length % 8 };
          toolInstanceMap.set(key, inst);
          toolInstances.push(inst);
        }
      }
    }
    return (group.steps ?? []).map((step: any, si: number) => {
      const stepIngs = (step.stepIngredients ?? [])
        .filter((name: string) => { const k = name.toLowerCase().trim(); if (assignedToStep.has(k)) return false; assignedToStep.add(k); return true; })
        .map((name: string) => {
          usedInSteps.add(name.toLowerCase().trim());
          const match = allIngredients.find((i: any) => i.name.toLowerCase().trim() === name.toLowerCase().trim());
          return { id: uid(), ingredientId: '', name, quantityValue: match?.quantityValue ?? 0, quantityUnit: match?.quantityUnit ?? 'g', prepNote: match?.prepNote ?? '' };
        });
      const matchedTask = FAMILY_MAP.get(step.taskFamily ?? '');
      const stepTools   = (step.stepTools ?? []).map((toolName: string) => {
        const inst = toolInstanceMap.get(toolName.toLowerCase().trim());
        return { id: uid(), instanceId: inst?.instanceId, equipmentId: '', name: toolName };
      });
      return {
        id: uid(), instruction: step.instruction ?? '', durationMinutes: step.durationMinutes ?? 0,
        temperatureCelsius: step.temperatureCelsius ?? 0,
        taskFamily: matchedTask?.family ?? step.taskFamily ?? undefined,
        taskId: matchedTask?.id ?? undefined, taskName: matchedTask?.name ?? undefined,
        taskType: matchedTask?.task_type ?? undefined,
        groupLabel: group.outputName || '__default__',
        groupToolInstances: si === 0 ? toolInstances : undefined,
        stepIngredients: stepIngs, stepTools,
      };
    });
  });

  const ingredients = allIngredients
    .filter((ing: any) => !usedInSteps.has(ing.name.toLowerCase().trim()))
    .map((ing: any) => ({ ingredientId: '', ingredientSlug: '', name: ing.name, quantityValue: ing.quantityValue ?? 0, quantityUnit: ing.quantityUnit ?? 'g', prepNote: ing.prepNote ?? '', optional: ing.optional ?? false }));

  return {
    canonicalId: '', versionId: '',
    title: imp.title ?? '', description: imp.description ?? '', cuisine: imp.cuisine ?? '',
    tags: Array.isArray(imp.tags) ? imp.tags.join(', ') : (imp.tags ?? ''),
    servings: imp.servings ?? 4, difficulty: imp.difficulty ?? 'medium',
    totalTimeMinutes: imp.totalTimeMinutes ?? 0, activeTimeMinutes: imp.activeTimeMinutes ?? 0,
    ingredients, steps, equipmentIds: [], isPublished: false,
  };
}

export default function ImportRecipePage() {
  const router = useRouter();

  const [text,       setText]       = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File|null>(null);
  const lastImportRef = useRef<File|null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status,  setStatus]  = useState<'idle'|'loading'|'decomposing'|'done'|'error'>('idle');
  const [error,   setError]   = useState<string|null>(null);
  const [preview, setPreview] = useState<any>(null);
  // Hidden faithful parse — sent to decompose-save as source_extraction (revert source).
  const [sourceExtraction, setSourceExtraction] = useState<any>(null);

  // Pre-seed from a product (e.g. "Create a recipe using this product" on an ingredient
  // page passes ?product=Name). Prefills the title and seeds the paste box with the
  // product as a starting ingredient line — the user fills in the rest.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const product = params.get('product');
    if (product) {
      setManualTitle(prev => prev || product);
      setText(prev => prev || `Ingredients:\n- ${product}\n\nMethod:\n`);
    }
  }, []);

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState<string|null>(null);
  const [pending,     setPending]     = useState<PendingChange|null>(null);

  // ── Create-with-AI butler (generate from a prompt) ──
  const [genPrompt,   setGenPrompt]   = useState('');
  const [genLoading,  setGenLoading]  = useState(false);
  const [genError,    setGenError]    = useState<string|null>(null);
  // The butler's non-generate responses (clarify / existing). When it generates,
  // we feed the text straight into the import pipeline and clear these.
  const [genClarify,  setGenClarify]  = useState<{ question: string; suggestions: string[] }|null>(null);
  const [genExisting, setGenExisting] = useState<{ id: string; slug: string|null; title: string; isPublished: boolean; description?: string|null; isMeal?: boolean }[]|null>(null);

  // ── Dish-list spine (the create flow's core model) ──
  // A meal is a LIST of dishes; each resolves to LINK (existing) or MAKE (new). The list
  // composes into one meal. Single dish = list of one. Populated by a `meal` response (and
  // later by Add-another-dish / single + upload paths). See Dish_List_Create_Model doc.
  type DishEntry = {
    id: string;
    name: string;
    status: 'linked' | 'make';
    canonicalSlug?: string | null;
    canonicalId?: string;
    title?: string;
    otherMatchCount?: number;
  };
  const [dishes, setDishes] = useState<DishEntry[]>([]);
  const [composing, setComposing] = useState(false);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading, pending]);

  const handleFileSelect = (file: File) => {
    const allowed = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // .xlsx
      'application/vnd.ms-excel',                                                  // .xls
    ];
    if (!allowed.includes(file.type)) {
      setError('Unsupported file type. Please use PDF, JPG, PNG, WebP, TXT, Word, or Excel.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large. Maximum 20MB.');
      return;
    }
    setUploadFile(file);
    setText('');
    // Auto-import immediately on file selection
    handleImportFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleImportFile = async (file: File) => {
    lastImportRef.current = file;
    setStatus('loading');
    setError(null);
    setPreview(null);
    setChatHistory([]);
    setPending(null);

    try {
      let body: any;
      if (file.type === 'text/plain') {
        const text = await file.text();
        body = { text };
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        body = { file: base64, mediaType: file.type };
      }
      const res  = await fetch('/api/recipes/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');

      // The faithful parse — kept hidden as the revert / re-decompose source.
      const parse = manualTitle.trim() ? { ...data.recipe, title: manualTitle.trim() } : data.recipe;
      setSourceExtraction(parse);

      // Step 2: decompose the parse into the atomic executable DAG (what the user sees).
      setStatus('decomposing');
      const dres = await fetch('/api/recipes/decompose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction: parse }),
      });
      const ddata = await dres.json();
      if (!dres.ok || !ddata.dag) throw new Error(ddata.error ?? 'We had trouble structuring that recipe. Please try again.');

      // preview holds the editable meta (seeded from the parse) + the DAG nodes.
      setPreview({
        title:       parse.title ?? '',
        description: parse.description ?? '',
        cuisine:     parse.cuisine ?? '',
        tags:        Array.isArray(parse.tags) ? parse.tags : (parse.tags ? String(parse.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : []),
        servings:    ddata.dag.servings ?? parse.servings ?? 4,
        difficulty:  parse.difficulty ?? 'medium',
        totalTimeMinutes: parse.totalTimeMinutes ?? 0,
        dag:         ddata.dag,
      });
      setStatus('done');
    } catch (err: any) {
      setError(err.message ?? 'Import failed');
      setStatus('error');
    }
  };

  const handleSave = async () => {
    if (!preview?.dag) return;
    setSaving(true);
    try {
      const meta = {
        title:       preview.title,
        description: preview.description,
        cuisine:     preview.cuisine,
        tags:        Array.isArray(preview.tags) ? preview.tags : [],
        servings:    preview.servings,
        difficulty:  preview.difficulty,
        totalTimeSeconds: (preview.totalTimeMinutes ?? 0) * 60,
      };
      const res = await fetch('/api/recipes/decompose-save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ meta, dag: preview.dag, sourceExtraction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      sessionStorage.setItem('soupdog_saved', preview.title ?? 'Recipe');
      router.push('/my/recipes');
    } catch (err: any) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const [streamingText, setStreamingText] = useState('');

  const handleImport = async () => {
    if (!text.trim()) return;
    await handleImportFile(new File([text], 'recipe.txt', { type: 'text/plain' }));
  };

  // Create-with-AI: ask the butler. Three outcomes —
  //  • clarify  → show the question + tappable options (re-submits on tap)
  //  • existing → show links to the user's matching recipe(s); don't regenerate
  //  • generate → feed the returned recipe text into the normal import pipeline
  const handleGenerate = async (overridePrompt?: string, skipExisting?: boolean) => {
    const p = (overridePrompt ?? genPrompt).trim();
    if (!p || genLoading) return;
    setGenLoading(true);
    setGenError(null);
    setGenClarify(null);
    setGenExisting(null);
    try {
      const res  = await fetch('/api/recipes/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p, skipExisting: skipExisting === true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');

      if (data.clarifyingQuestion) {
        setGenClarify(data.clarifyingQuestion);
        return;
      }
      if (Array.isArray(data.existing) && data.existing.length) {
        setGenExisting(data.existing);
        return;
      }
      if (data.meal && Array.isArray(data.meal.dishes) && data.meal.dishes.length) {
        // Multi-dish request → populate the DISH LIST (the spine). The user reviews the
        // list (each dish linked/make), can remove dishes, then Composes. (Composing runs
        // the proven assembly.) Single-dish requests never reach here.
        setDishes(data.meal.dishes.map((d: any, i: number) => ({
          id: `d${Date.now().toString(36)}${i}`,
          name: d.name,
          status: d.status === 'linked' ? 'linked' : 'make',
          canonicalSlug: d.canonicalSlug ?? null,
          canonicalId: d.canonicalId,
          title: d.title,
          otherMatchCount: d.otherMatchCount,
        })));
        return;
      }
      if (typeof data.recipeText === 'string' && data.recipeText.trim()) {
        // Seed the detected title (so the parser/preview keeps it) and run the
        // generated text through the exact same path as pasted text.
        if (typeof data.title === 'string' && data.title.trim()) setManualTitle(data.title.trim());
        await handleImportFile(new File([data.recipeText], 'recipe.txt', { type: 'text/plain' }));
        return;
      }
      throw new Error('Could not generate a recipe — try rephrasing.');
    } catch (err: any) {
      setGenError(err.message ?? 'Generation failed');
    } finally {
      setGenLoading(false);
    }
  };

  // Assemble a MULTI-DISH meal from the resolved dish list (Slice 1).
  // - `linked` dishes → resolvedDishes (the decompose engine links them, doesn't re-make).
  // - `make` dishes → generate each one's recipe text, combine into ONE blob, parse once
  //   into a multi-group extraction, then decompose with resolvedDishes → one meal DAG.
  // The resulting preview + handleSave path are unchanged (already meal-aware & proven).
  const handleCreateMeal = async (
    dishes: { name: string; status: 'linked' | 'make'; canonicalSlug?: string | null; title?: string }[],
  ) => {
    setGenError(null);
    setError(null);
    setPreview(null);
    setChatHistory([]);
    setPending(null);
    setStatus('loading');

    try {
      const linked = dishes.filter(d => d.status === 'linked' && d.canonicalSlug);
      const toMake = dishes.filter(d => d.status === 'make');

      const resolvedDishes = linked.map(d => ({
        dishName: d.title || d.name,
        canonicalSlug: d.canonicalSlug as string,
      }));

      const componentNames = dishes.map(d => d.title || d.name).filter(Boolean);

      // PURE-LINK MEAL: every dish already exists in the catalogue → nothing to make or
      // decompose. Build a minimal meal DAG (no own steps, just the links) and preview it.
      if (toMake.length === 0) {
        setStatus('decomposing');
        const linkedDishesForDag = linked.map(d => ({
          dishName: d.title || d.name,
          canonicalSlug: d.canonicalSlug as string,
        }));
        const pureDag = { title: composeMenuTitle(componentNames), servings: 4, nodes: [], linkedDishes: linkedDishesForDag };
        setSourceExtraction(null);
        setPreview({
          title:       composeMenuTitle(componentNames),
          components:  componentNames,
          description: '',
          cuisine:     '',
          tags:        [],
          servings:    4,
          difficulty:  'medium',
          totalTimeMinutes: 0,
          dag:         pureDag,
        });
        setStatus('done');
        return;
      }

      // 1. Generate each to-make dish's recipe text (single-dish generate). If a dish
      //    can't be written as a recipe (e.g. an off-the-shelf item like a soft drink, or
      //    a thin/empty generation), DON'T inject junk text into the parser — carry it as a
      //    SERVED component instead (shown as a ready-made item, not cooked). This keeps one
      //    un-makeable dish from breaking the whole meal's structure.
      const madeTexts: string[] = [];
      const servedComponents: string[] = [];
      for (const d of toMake) {
        let madeOk = false;
        try {
          const gr = await fetch('/api/recipes/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: d.name }),
          });
          const gd = await gr.json();
          if (gr.ok && typeof gd.recipeText === 'string' && gd.recipeText.trim().length > 40) {
            madeTexts.push(gd.recipeText.trim());
            madeOk = true;
          }
        } catch { /* fall through to served */ }
        if (!madeOk) servedComponents.push(d.title || d.name);
      }

      // If NOTHING could be made (every to-make dish was served/un-makeable), there's no
      // recipe to structure — build a minimal meal of served components + any linked dishes.
      if (madeTexts.length === 0) {
        setStatus('decomposing');
        const linkedDishesForDag = linked.map(d => ({
          dishName: d.title || d.name,
          canonicalSlug: d.canonicalSlug as string,
        }));
        const servedDag = { title: composeMenuTitle(componentNames), servings: 4, nodes: [], linkedDishes: linkedDishesForDag, servedComponents };
        setSourceExtraction(null);
        setPreview({
          title:       composeMenuTitle(componentNames),
          components:  componentNames,
          description: '',
          cuisine:     '',
          tags:        [],
          servings:    4,
          difficulty:  'medium',
          totalTimeMinutes: 0,
          dag:         servedDag,
        });
        setStatus('done');
        return;
      }

      // 2. Combine into one text blob, each dish a clear section (so the parser emits
      //    one group per dish via outputName).
      const combined = madeTexts.join('\n\n---\n\n');

      // 3. Parse the combined text into a (multi-group) extraction.
      setStatus('decomposing');
      const ires = await fetch('/api/recipes/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combined }),
      });
      const idata = await ires.json();
      if (!ires.ok || !idata.recipe) {
        // The made dishes couldn't be structured. Rather than fail the whole meal, fall
        // back to a minimal meal of the linked dishes + served components (the made dishes
        // become served too, since we couldn't structure them).
        if (linked.length > 0 || servedComponents.length > 0) {
          setStatus('decomposing');
          const linkedDishesForDag = linked.map(d => ({ dishName: d.title || d.name, canonicalSlug: d.canonicalSlug as string }));
          const fallbackServed = [...servedComponents, ...toMake.map(d => d.title || d.name).filter(n => !servedComponents.includes(n))];
          const fbDag = { title: composeMenuTitle(componentNames), servings: 4, nodes: [], linkedDishes: linkedDishesForDag, servedComponents: fallbackServed };
          setSourceExtraction(null);
          setPreview({ title: composeMenuTitle(componentNames), components: componentNames, description: '', cuisine: '', tags: [], servings: 4, difficulty: 'medium', totalTimeMinutes: 0, dag: fbDag });
          setStatus('done');
          return;
        }
        throw new Error(idata.error ?? 'Could not structure the meal.');
      }
      const parse = idata.recipe;
      setSourceExtraction(parse);

      // 4. Decompose with resolvedDishes — linked dishes get linked, made dishes get
      //    decomposed inline, all in one unified meal DAG.
      const dres = await fetch('/api/recipes/decompose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction: parse, resolvedDishes }),
      });
      const ddata = await dres.json();
      if (!dres.ok || !ddata.dag) throw new Error(ddata.error ?? 'We had trouble structuring that meal. Please try again.');

      // Carry any served components (off-the-shelf / un-makeable dishes) onto the DAG so the
      // preview shows them as ready-made items alongside the cooked dishes.
      if (servedComponents.length > 0) {
        ddata.dag.servedComponents = servedComponents;
      }

      // Menu-style title from the DISH NAMES (not the parser's single-dish title — which
      // would name the meal after whichever dish was decomposed inline). Editable below.
      const mealTitle = composeMenuTitle(componentNames);
      setPreview({
        title:       mealTitle,
        components:  componentNames,   // the "what's for dinner" manifest, shown near the title
        description: parse.description ?? '',
        cuisine:     parse.cuisine ?? '',
        tags:        Array.isArray(parse.tags) ? parse.tags : [],
        servings:    ddata.dag.servings ?? parse.servings ?? 4,
        difficulty:  parse.difficulty ?? 'medium',
        totalTimeMinutes: parse.totalTimeMinutes ?? 0,
        dag:         ddata.dag,
      });
      setStatus('done');
    } catch (err: any) {
      setError(err.message ?? 'Could not create the meal.');
      setStatus('error');
    }
  };

  // Compose the current dish list into a meal (runs the proven assembly).
  const composeMeal = async () => {
    if (!dishes.length || composing) return;
    setComposing(true);
    try {
      await handleCreateMeal(dishes);
    } finally {
      setComposing(false);
    }
  };

  const removeDish = (id: string) => setDishes(prev => prev.filter(d => d.id !== id));

  // ── Add another dish: resolve a typed dish name against the catalogue (link on match,
  //    make otherwise). Reuses the meal-plan options endpoint (?level=dish so only dishes,
  //    never meals, are matched as components). No AI needed — make-dishes are generated
  //    later at compose time. ──
  const [addDishInput, setAddDishInput] = useState('');
  const [addingDish, setAddingDish]     = useState(false);
  const [showAddDish, setShowAddDish]   = useState(false);

  const addDish = async () => {
    const name = addDishInput.trim();
    if (!name || addingDish) return;
    setAddingDish(true);
    try {
      let entry: DishEntry;
      try {
        const res = await fetch(`/api/my/meal-plan/options?q=${encodeURIComponent(name)}&level=dish`);
        const data = await res.json();
        const opts: any[] = Array.isArray(data.options) ? data.options : [];
        // Prefer an exact (case-insensitive) title match; else the first contains-match.
        const exact = opts.find(o => (o.title || '').trim().toLowerCase() === name.toLowerCase());
        const match = exact ?? opts[0];
        if (match && match.slug) {
          entry = { id: `d${Date.now().toString(36)}`, name, status: 'linked',
            canonicalSlug: match.slug, canonicalId: match.id, title: match.title,
            otherMatchCount: opts.length > 1 ? opts.length - 1 : 0 };
        } else {
          entry = { id: `d${Date.now().toString(36)}`, name, status: 'make' };
        }
      } catch {
        entry = { id: `d${Date.now().toString(36)}`, name, status: 'make' };
      }
      setDishes(prev => [...prev, entry]);
      setAddDishInput('');
      setShowAddDish(false);
    } finally {
      setAddingDish(false);
    }
  };

  const handleGenKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !preview) return;
    const message = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);
    setStreamingText('');
    setPending(null);

    try {
      const res = await fetch('/api/recipes/import/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipe: preview, message, history: chatHistory }),
      });

      if (!res.ok) throw new Error('Request failed');

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'chunk') {
              setStreamingText(t => t + event.text);
            } else if (event.type === 'progress') {
              // modification in progress — spinner stays, no text shown
            } else if (event.type === 'done') {
              setStreamingText('');
              if (event.responseType === 'answer') {
                setChatHistory(prev => [...prev, { type: 'answer', user: message, recipe: preview, assistantSummary: event.answer }]);
              } else if (event.requiresConfirmation) {
                setPending({ recipe: event.recipe, summary: event.changeSummary });
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: event.recipe, assistantSummary: event.changeSummary }]);
              } else {
                setPreview(event.recipe);
                setChatHistory(prev => [...prev, { type: 'modification', user: message, recipe: event.recipe, assistantSummary: event.changeSummary }]);
              }
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) { /* skip malformed events */ }
        }
      }
    } catch (err: any) {
      const msg = err.message ?? 'Request failed';
      setChatError(msg.includes('JSON') ? 'The recipe is too large for a single update. Try breaking it into smaller changes.' : msg);
      setStreamingText('');
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleApply = () => {
    if (!pending) return;
    setPreview(pending.recipe);
    setPending(null);
  };

  const handleCancel = () => {
    setChatHistory(prev => prev.slice(0, -1));
    setPending(null);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  };

  const dagNodes: any[] = preview?.dag?.nodes ?? [];
  const stepCount = dagNodes.length;

  // Ingredients are introduced on nodes (one per node, by atomicity). Derive the flat
  // list for the summary count from the DAG. (Presentation is handled by RecipeDisplay.)
  const dagIngredients: any[] = dagNodes
    .map((n: any) => (n.ingredients ?? [])[0])
    .filter(Boolean)
    .map((ing: any) => ({ name: ing.name, quantityValue: ing.qty ?? 0, quantityUnit: ing.unit ?? '', prepNote: ing.prep ?? '' }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 100px' }}>

      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3 -mx-6 mb-8">
        <Link href="/my/recipes"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)]">Add recipe</span>
        <span style={{ marginLeft: 'auto' }}>
          <Link href="/my/recipes/new"
            style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}
            className="hover:text-[var(--accent)] transition-colors">
            Advanced editor →
          </Link>
        </span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, marginBottom: 6 }}>
        Add recipe
      </h1>
      <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
        Describe what you'd like to make, upload a photo or PDF, or paste the recipe text.
      </p>

      {status !== 'done' && (
        <>
          {/* ── Describe-what-you-want (the butler) — first entry point ── */}
          <div style={{ border: B, padding: '16px 18px', marginBottom: 20, background: 'var(--accent-subtle)' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--accent)', marginBottom: 8 }}>
              Describe what you'd like
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={genPrompt}
                onChange={e => setGenPrompt(e.target.value)}
                onKeyDown={handleGenKeyDown}
                rows={2}
                disabled={genLoading}
                placeholder={'Tell me what to make — e.g. "a recipe for a Negroni" or "a quick weeknight dhal"'}
                style={{ flex: 1, padding: '9px 12px', border: B, background: 'var(--bg)', color: 'var(--fg)',
                  fontFamily: MONO, fontSize: 12, outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' as const }}
              />
              <button
                onClick={() => handleGenerate()}
                disabled={genLoading || !genPrompt.trim()}
                style={{ flexShrink: 0, padding: '9px 16px', border: 'none', background: 'var(--accent)', color: 'var(--bg)',
                  fontFamily: MONO, fontSize: 11, cursor: genLoading || !genPrompt.trim() ? 'default' : 'pointer',
                  opacity: genLoading || !genPrompt.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
                {genLoading ? <><Loader2 size={13} className="animate-spin" /> Working</> : <><Send size={13} /> Make it</>}
              </button>
            </div>

            {genError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
                fontFamily: MONO, fontSize: 11, color: '#92400e' }}>
                <AlertTriangle size={12} /> {genError}
              </div>
            )}

            {/* Butler asked a clarifying question */}
            {genClarify && (
              <div style={{ marginTop: 12, padding: '10px 12px', border: B, background: 'var(--bg)' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)', lineHeight: 1.5, marginBottom: genClarify.suggestions.length ? 8 : 0 }}>
                  {genClarify.question}
                </div>
                {genClarify.suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {genClarify.suggestions.map((s, i) => (
                      <button key={i}
                        onClick={() => { const np = `${genPrompt} — ${s}`.trim(); setGenPrompt(np); handleGenerate(np); }}
                        style={{ fontFamily: MONO, fontSize: 10, padding: '4px 10px', border: B,
                          background: 'var(--surface)', color: 'var(--accent)', cursor: 'pointer' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Butler found existing recipe(s) — don't regenerate, link to them */}
            {genExisting && (
              <div style={{ marginTop: 12, padding: '10px 12px', border: B, background: 'var(--bg)' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)', lineHeight: 1.5, marginBottom: 8 }}>
                  You already have {genExisting.length === 1 ? 'this recipe' : 'recipes like this'}:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {genExisting.map(rec => (
                    <div key={rec.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Link href={`/my/recipes/${rec.id}`}
                          style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent)', textDecoration: 'underline' }}>
                          {rec.title}
                        </Link>
                        {rec.isMeal && (
                          <span style={{ fontFamily: MONO, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', border: B, padding: '1px 5px' }}>
                            meal
                          </span>
                        )}
                        {rec.isPublished && rec.slug && (
                          <Link href={`/recipes/${rec.slug}`}
                            style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}>
                            view live →
                          </Link>
                        )}
                      </div>
                      {rec.description && (
                        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                          {rec.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setGenExisting(null); handleGenerate(genPrompt, true); }}
                  style={{ marginTop: 10, fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                    background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  Make a new one anyway
                </button>
              </div>
            )}

            {/* Dish-list spine — the meal as a list of dishes (link/make), review then compose */}
            {dishes.length > 0 && (
              <div style={{ marginTop: 12, padding: '12px 14px', border: B, background: 'var(--bg)' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 10 }}>
                  Dishes in this meal
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dishes.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 10px', border: B, background: 'var(--surface)' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg)' }}>{d.title || d.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: d.status === 'linked' ? 'var(--accent)' : 'var(--muted)' }}>
                          {d.status === 'linked' ? 'from your recipes' : 'will be made'}
                        </span>
                        <button onClick={() => removeDish(d.id)} title="Remove this dish"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add another dish — type a name; links if you have it, else it's made */}
                {showAddDish ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      value={addDishInput}
                      onChange={e => setAddDishInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDish(); } if (e.key === 'Escape') { setShowAddDish(false); setAddDishInput(''); } }}
                      autoFocus
                      placeholder="e.g. garlic bread"
                      style={{ flex: 1, padding: '7px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    <button onClick={addDish} disabled={addingDish || !addDishInput.trim()}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: B, background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, cursor: addingDish ? 'default' : 'pointer', opacity: addingDish || !addDishInput.trim() ? 0.6 : 1 }}>
                      {addingDish ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddDish(true)}
                    style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Plus size={12} /> Add another dish
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <button onClick={composeMeal} disabled={composing}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: 'var(--accent)', color: 'var(--bg)', fontFamily: MONO, fontSize: 11, cursor: composing ? 'default' : 'pointer', opacity: composing ? 0.7 : 1 }}>
                    {composing ? <><Loader2 size={13} className="animate-spin" /> Composing</> : <>Compose meal</>}
                  </button>
                  <button onClick={() => { setDishes([]); setShowAddDish(false); setAddDishInput(''); }} disabled={composing}
                    style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>or add your own</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Optional recipe name */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 4 }}>
              Recipe name <span style={{ opacity: 0.5 }}>(optional — we'll detect it from the content)</span>
            </div>
            <input
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="e.g. Chicken Tikka Masala"
              style={{ width: '100%', padding: '8px 12px', border: B, background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            {/* File upload zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1px dashed ${dragOver ? 'var(--accent)' : uploadFile ? 'var(--accent)' : 'var(--border)'}`,
                background: dragOver ? 'var(--accent-subtle)' : uploadFile ? 'var(--accent-subtle)' : 'var(--surface)',
                padding: '16px 20px', marginBottom: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all 0.15s',
              }}>
              <input ref={fileInputRef} type="file"
                accept=".pdf,.txt,.docx,.xlsx,.xls,image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              <div style={{ fontSize: 20, flexShrink: 0 }}>
                {uploadFile ? '📄' : '⬆'}
              </div>
              <div>
                {uploadFile ? (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                      {uploadFile.name}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                      {(uploadFile.size / 1024).toFixed(0)} KB · click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--fg)' }}>
                      Upload a photo, screenshot, or PDF
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                      Drag & drop or click · JPG, PNG, WebP, PDF, Word, Excel, TXT · max 20MB
                    </div>
                  </div>
                )}
              </div>
              {uploadFile && (
                <button
                  onClick={e => { e.stopPropagation(); setUploadFile(null); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                  ✕ Remove
                </button>
              )}
            </div>

            {/* Text divider */}
            {!uploadFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>or paste text</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}

            {/* Text area — hidden when file selected */}
            {!uploadFile && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                    Recipe text
                  </div>
                  <button onClick={() => setText(EXAMPLE)}
                    style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    Load example
                  </button>
                </div>
                <textarea value={text} onChange={e => setText(e.target.value)}
                  placeholder="Paste recipe here — title, ingredients, method, serving size, timings…"
                  style={{ width: '100%', minHeight: 280, padding: '12px 14px', border: B,
                    background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 12,
                    outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' }} />
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                  {text.length} / 20,000 characters
                </div>
              </>
            )}
          </div>

          <div style={{ border: B, padding: '12px 16px', marginBottom: 20, background: 'var(--surface-hover)' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 8 }}>
              Tips for best results
            </div>
            {['Include serving size and total time if available',
              'Numbered steps work best',
              'Ingredient quantities in any unit — Soupdog converts to metric',
              'You can paste recipes in any language',
              'Review and adjust the result before saving',
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: i < 4 ? 5 : 0, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>{tip}
              </div>
            ))}
          </div>

          {status === 'error' && error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              border: '1px solid #b45309', background: '#fef3c7', fontFamily: MONO, fontSize: 11,
              color: '#92400e', marginBottom: 16 }}>
              <AlertTriangle size={12} />
              <span style={{ flex: 1 }}>{error}</span>
              {lastImportRef.current && (
                <button
                  type="button"
                  onClick={() => { if (lastImportRef.current) handleImportFile(lastImportRef.current); }}
                  style={{ fontFamily: MONO, fontSize: 11, color: '#92400e', background: 'transparent',
                    border: '1px solid #b45309', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </>
      )}

      {status === 'done' && preview && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, alignItems: 'start' }}>

          {/* Recipe preview (DAG) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              border: B, background: 'var(--surface-hover)', fontFamily: MONO, fontSize: 11,
              color: 'var(--muted)', marginBottom: 20 }}>
              {stepCount} steps · {dagIngredients.length} ingredients
              {chatHistory.filter(t => t.type === 'modification').length > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--accent)' }}>
                  · {chatHistory.filter(t => t.type === 'modification').length} edit{chatHistory.filter(t => t.type === 'modification').length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div style={{ border: B }}>
              <div style={{ padding: '16px 20px', borderBottom: B, display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Title */}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Title</div>
                  <input
                    value={preview.title ?? ''}
                    onChange={e => setPreview((p: any) => ({ ...p, title: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font-display)', fontSize: 18, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                  {Array.isArray(preview.components) && preview.components.length > 1 && (
                    <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                      This meal: {preview.components.join(' · ')}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Description</div>
                  <textarea
                    value={preview.description ?? ''}
                    onChange={e => setPreview((p: any) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    style={{ width: '100%', padding: '7px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' as const }}
                  />
                </div>

                {/* Cuisine + Difficulty row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Cuisine</div>
                    <input
                      value={preview.cuisine ?? ''}
                      onChange={e => setPreview((p: any) => ({ ...p, cuisine: e.target.value }))}
                      placeholder="e.g. Italian"
                      style={{ width: '100%', padding: '7px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>
                      Difficulty <span style={{ opacity: 0.5 }}>(suggested)</span>
                    </div>
                    <select
                      value={preview.difficulty ?? 'medium'}
                      onChange={e => setPreview((p: any) => ({ ...p, difficulty: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 4 }}>Tags <span style={{ opacity: 0.5 }}>(comma-separated)</span></div>
                  <input
                    value={Array.isArray(preview.tags) ? preview.tags.join(', ') : (preview.tags ?? '')}
                    onChange={e => setPreview((p: any) => ({ ...p, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) }))}
                    placeholder="e.g. pasta, quick, weeknight"
                    style={{ width: '100%', padding: '7px 10px', border: B, background: 'var(--bg)', color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>

                {/* Serves row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingTop: 4 }}>
                  {[['Serves', preview.servings], ['Total time', preview.totalTimeMinutes ? `${preview.totalTimeMinutes} min` : null]]
                    .filter(([, v]) => v).map(([label, value]) => (
                    <div key={label as string} style={{ fontFamily: MONO, fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginRight: 6 }}>{label}</span>
                      <span style={{ color: 'var(--fg)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ingredients + Procedure — rendered by the SHARED component, so the
                  preview looks EXACTLY like the saved recipe page. Non-interactive
                  (no cooking checkboxes); the user adjusts via the meta fields above
                  and (later) the chat panel. */}
              <RecipeDisplay recipe={dagToRecipe(preview.dag, {
                title:       preview.title,
                description: preview.description,
                cuisine:     preview.cuisine,
                tags:        Array.isArray(preview.tags) ? preview.tags : [],
                servings:    preview.servings,
                difficulty:  preview.difficulty,
                totalTimeMinutes: preview.totalTimeMinutes,
              })} />
            </div>
          </div>

          {/* Chat panel — gated off on the DAG path; returns DAG-native in a later increment */}
          {false && (
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ border: B, background: 'var(--surface)', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>

              <div style={{ padding: '10px 16px', borderBottom: B, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                  Adjust recipe
                </span>
                {chatHistory.length > 0 && (
                  <button onClick={() => { setChatHistory([]); setPending(null); }}
                    title="Clear history"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 10, minHeight: 160, maxHeight: 360 }}>

                {chatHistory.length === 0 && !chatLoading && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center', padding: '12px 0' }}>
                      Ask questions or give instructions — <em>'What can I substitute for guanciale?'</em> or <em>'Make it vegetarian'</em>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {['Make it vegetarian', 'Scale to 6 servings', 'Break down steps further', 'Add timing to each step'].map(s => (
                        <button key={s} onClick={() => setChatInput(s)}
                          style={{ textAlign: 'left', background: 'var(--surface-hover)', border: B,
                            padding: '7px 10px', cursor: 'pointer', fontFamily: MONO, fontSize: 10, color: 'var(--muted)', transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {chatHistory.map((turn, i) => {
                  const isPending = pending && i === chatHistory.length - 1 && turn.type === 'modification';
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff',
                        padding: '6px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                        {turn.user}
                      </div>
                      {isPending ? (
                        <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-subtle)',
                          padding: '10px 12px', fontFamily: MONO, fontSize: 10, lineHeight: 1.5 }}>
                          <div style={{ color: 'var(--fg)', marginBottom: 8 }}>{turn.assistantSummary}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handleApply}
                              style={{ flex: 1, padding: '6px 0', background: 'var(--accent)', color: '#fff',
                                border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
                              Apply
                            </button>
                            <button onClick={handleCancel}
                              style={{ flex: 1, padding: '6px 0', background: 'none', color: 'var(--muted)',
                                border: B, cursor: 'pointer', fontFamily: MONO, fontSize: 10 }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : turn.type === 'answer' ? (
                        <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                          padding: '8px 12px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                          color: 'var(--fg)', lineHeight: 1.6 }}>
                          {turn.assistantSummary}
                        </div>
                      ) : (
                        <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                          padding: '6px 10px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                          color: 'var(--muted)', lineHeight: 1.5 }}>
                          ✓ {turn.assistantSummary}
                        </div>
                      )}
                    </div>
                  );
                })}

                {(chatLoading || streamingText) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {streamingText ? (
                      <div style={{ alignSelf: 'flex-start', background: 'var(--surface-hover)', border: B,
                        padding: '8px 12px', maxWidth: '85%', fontFamily: MONO, fontSize: 10,
                        color: 'var(--fg)', lineHeight: 1.6 }}>
                        {streamingText}<span style={{ opacity: 0.4 }}>▋</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                        <Loader2 size={11} className="animate-spin" /> Thinking…
                      </div>
                    )}
                  </div>
                )}

                {chatError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                    border: '1px solid #b45309', background: '#fef3c7', fontFamily: MONO, fontSize: 10, color: '#92400e' }}>
                    <AlertTriangle size={10} />{chatError}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              <div style={{ borderTop: B, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea ref={chatInputRef} value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a question or give an instruction…"
                  rows={2} disabled={chatLoading || !!pending}
                  style={{ flex: 1, padding: '8px 10px', border: B, background: 'var(--bg)',
                    color: 'var(--fg)', fontFamily: MONO, fontSize: 11, outline: 'none',
                    resize: 'none', lineHeight: 1.5, opacity: (chatLoading || !!pending) ? 0.4 : 1 }} />
                <button onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim() || !!pending}
                  style={{ padding: '8px 10px', border: 'none', background: 'var(--accent)', color: '#fff',
                    cursor: (chatLoading || !chatInput.trim() || !!pending) ? 'not-allowed' : 'pointer',
                    opacity: (chatLoading || !chatInput.trim() || !!pending) ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {chatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
              <div style={{ padding: '5px 12px', borderTop: B, fontFamily: MONO, fontSize: 9, color: 'var(--muted)', opacity: 0.6 }}>
                Enter to send · Shift+Enter for new line
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {status === 'done' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
            Review and save
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setStatus('idle'); setPreview(null); setSourceExtraction(null); setChatHistory([]); setPending(null); setUploadFile(null); setDishes([]); }}
              style={{ padding: '8px 16px', border: '1px solid var(--border)', background: 'none',
                fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
              ← Start over
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', border: 'none',
                background: 'var(--accent)', color: '#fff', fontFamily: MONO, fontSize: 11,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Save recipe'}
            </button>
          </div>
        </div>
      )}

      {status !== 'done' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
          <span style={{ fontFamily: MONO, fontSize: 10, color: status === 'error' && error ? '#b91c1c' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {status === 'error' && error
              ? <><AlertTriangle size={12} /> {error}</>
              : composing ? 'Composing your meal…'
              : status === 'loading' ? (uploadFile ? 'Reading file…' : 'Reading recipe…')
              : status === 'decomposing' ? 'Breaking into steps…'
              : 'Upload a file or paste a recipe'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.back()}
              style={{ padding: '8px 16px', border: '1px solid var(--border)', background: 'none',
                fontFamily: MONO, fontSize: 11, cursor: 'pointer', color: 'var(--muted)' }}>
              Cancel
            </button>
            <button onClick={handleImport} disabled={composing || status === 'loading' || status === 'decomposing' || (!text.trim() && !uploadFile)}
              style={{ padding: '8px 20px', border: 'none', background: 'var(--accent)', color: '#fff',
                fontFamily: MONO, fontSize: 11,
                cursor: composing || status === 'loading' || status === 'decomposing' || (!text.trim() && !uploadFile) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                opacity: composing || status === 'loading' || status === 'decomposing' || (!text.trim() && !uploadFile) ? 0.6 : 1 }}>
              {composing
                ? <><Loader2 size={12} className="animate-spin" /> Composing…</>
                : status === 'loading' || status === 'decomposing'
                ? <><Loader2 size={12} className="animate-spin" /> {status === 'decomposing' ? 'Structuring…' : 'Reading…'}</>
                : 'Add recipe'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
