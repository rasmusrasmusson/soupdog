-- ═══════════════════════════════════════════════════════════════
--  Soupdog — Seed Data (UUID version)
-- ═══════════════════════════════════════════════════════════════

-- ── Ingredients ───────────────────────────────────────────────
insert into ingredients (id, slug, name, description, allergens) values
  ('00000000-0000-0000-0000-000000000001', 'chicken-thigh',     'Chicken thigh',        'Boneless skinless chicken thigh, ideal for marinating and grilling.', null),
  ('00000000-0000-0000-0000-000000000002', 'full-fat-yogurt',   'Full-fat yogurt',       'Plain full-fat yogurt for marinades and sauces.', array['milk']),
  ('00000000-0000-0000-0000-000000000003', 'tikka-curry-paste', 'Tikka curry paste',     'Spiced curry paste base for tikka dishes.', null),
  ('00000000-0000-0000-0000-000000000004', 'tomato-passata',    'Tomato passata',        'Smooth sieved tomatoes, used as a sauce base.', null),
  ('00000000-0000-0000-0000-000000000005', 'heavy-cream',       'Heavy cream',           'High-fat cream for finishing sauces.', array['milk']),
  ('00000000-0000-0000-0000-000000000006', 'ground-ginger',     'Ground ginger',         'Dried ground ginger root.', null),
  ('00000000-0000-0000-0000-000000000007', 'garam-masala',      'Garam masala',          'Aromatic spice blend used in Indian cooking.', null),
  ('00000000-0000-0000-0000-000000000008', 'kosher-salt',       'Kosher salt',           'Coarse salt with clean flavour.', null),
  ('00000000-0000-0000-0000-000000000009', 'onion',             'Onion',                 'Brown onion, finely diced for sauces.', null),
  ('00000000-0000-0000-0000-000000000010', 'garlic',            'Garlic',                'Fresh garlic cloves, minced.', null),
  ('00000000-0000-0000-0000-000000000011', 'neutral-oil',       'Neutral oil',           'Flavourless cooking oil.', null),
  ('00000000-0000-0000-0000-000000000020', 'bread-flour',       'Bread flour',           'High-protein flour for bread baking.', array['gluten']),
  ('00000000-0000-0000-0000-000000000021', 'water',             'Water',                 'Filtered water at 35°C for dough hydration.', null),
  ('00000000-0000-0000-0000-000000000022', 'sourdough-starter', 'Sourdough starter',     'Active levain at peak activity, 100% hydration.', array['gluten']),
  ('00000000-0000-0000-0000-000000000023', 'salt',              'Salt',                  'Fine sea salt for bread dough.', null)
on conflict (slug) do nothing;

-- ── Equipment ─────────────────────────────────────────────────
insert into equipment (id, slug, name, category, description, connected) values
  ('00000000-0000-0000-0001-000000000001', 'grill-broiler',      'Grill or broiler',       'oven',  'High-heat grill or oven broiler for charring.', false),
  ('00000000-0000-0000-0001-000000000002', 'metal-skewers',      'Metal skewers',          'other', 'Flat metal skewers for grilling meat.', false),
  ('00000000-0000-0000-0001-000000000003', 'heavy-bottomed-pan', 'Heavy-bottomed pan',     'pan',   'Wide heavy pan for sauces and sautéing.', false),
  ('00000000-0000-0000-0001-000000000004', 'mixing-bowl',        'Mixing bowl',            'other', 'Large bowl for marinating.', false),
  ('00000000-0000-0000-0001-000000000010', 'dutch-oven',         'Dutch oven (cast iron)', 'pan',   'Heavy cast iron pot with lid, ideal for bread baking.', false),
  ('00000000-0000-0000-0001-000000000011', 'banneton',           'Banneton',               'other', 'Proofing basket for shaping sourdough.', false),
  ('00000000-0000-0000-0001-000000000012', 'bench-scraper',      'Bench scraper',          'other', 'Metal scraper for dough handling.', false),
  ('00000000-0000-0000-0001-000000000013', 'lame',               'Lame or sharp blade',    'knife', 'Razor blade for scoring bread dough.', false)
on conflict (slug) do nothing;

-- ── Recipes ───────────────────────────────────────────────────
insert into recipes (id, slug, version, title, description, cuisine, tags, servings, difficulty, total_time_seconds, active_time_seconds, passive_time_seconds, nutrition, is_published) values
  (
    '00000000-0000-0000-0002-000000000001',
    'chicken-tikka-masala', 1,
    'Chicken Tikka Masala',
    'A richly spiced tomato-cream curry. Marinade and char the chicken first, then finish in a slow-reduced masala sauce.',
    'Indian', array['curry','chicken','dinner','spiced'],
    4, 'medium', 5400, 3600, 1800,
    '{"calories":520,"protein":42,"fat":28,"carbohydrates":18,"fiber":3,"sodium":680}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0002-000000000002',
    'sourdough-loaf', 2,
    'Sourdough Loaf',
    'Open crumb, blistered crust. 75% hydration dough, cold retarded overnight, baked in a Dutch oven.',
    'European', array['bread','fermented','baking','passive'],
    10, 'hard', 86400, 5400, 81000,
    '{"calories":210,"protein":7,"fat":1,"carbohydrates":42,"fiber":2,"sodium":390}'::jsonb,
    true
  )
on conflict (slug) do nothing;

-- ── Recipe Ingredients ────────────────────────────────────────
insert into recipe_ingredients (recipe_id, ingredient_id, quantity_value, quantity_unit, food_state, prep_note, optional, order_index) values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 800,  'g',  'refrigerated', 'boneless, skinless, cut into chunks', false, 1),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000002', 150,  'ml', null, null, false, 2),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000003', 60,   'g',  null, null, false, 3),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000004', 400,  'ml', null, null, false, 4),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000005', 100,  'ml', null, null, false, 5),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000006', 5,    'g',  null, null, false, 6),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000007', 8,    'g',  null, null, false, 7),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000008', 8,    'g',  null, null, false, 8),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000009', 200,  'g',  null, 'finely diced', false, 9),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000010', 20,   'g',  null, 'minced', false, 10),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000011', 30,   'ml', null, null, false, 11),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000020', 500,  'g',  null, null, false, 1),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000021', 375,  'ml', null, 'at 35°C', false, 2),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000022', 100,  'g',  null, 'active, at peak', false, 3),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000023', 10,   'g',  null, null, false, 4)
on conflict do nothing;

-- ── Recipe Steps ──────────────────────────────────────────────
insert into recipe_steps (recipe_id, order_index, step_type, instruction, duration_seconds, temperature_celsius, notes) values
  ('00000000-0000-0000-0002-000000000001', 1, 'human',   'Combine yogurt, curry paste, garam masala, and 4g salt. Coat chicken thoroughly.', null, null,  'Marinade'),
  ('00000000-0000-0000-0002-000000000001', 2, 'passive', 'Cover and refrigerate to marinate.', 1800, null, 'Marinade'),
  ('00000000-0000-0000-0002-000000000001', 3, 'machine', 'Preheat grill or oven broiler to maximum heat.', null, 250, 'Char chicken'),
  ('00000000-0000-0000-0002-000000000001', 4, 'human',   'Thread chicken onto skewers. Grill, turning once, until charred at edges and cooked through.', 600, null, 'Char chicken'),
  ('00000000-0000-0000-0002-000000000001', 5, 'human',   'Heat oil in pan. Sauté onion and garlic until deep golden.', 720, null, 'Masala sauce'),
  ('00000000-0000-0000-0002-000000000001', 6, 'human',   'Add passata and ground ginger. Simmer to reduce and concentrate.', 1200, null, 'Masala sauce'),
  ('00000000-0000-0000-0002-000000000001', 7, 'human',   'Add grilled chicken to sauce. Stir in cream. Simmer briefly.', 300, null, 'Finish'),
  ('00000000-0000-0000-0002-000000000001', 8, 'human',   'Adjust salt. Finish with remaining garam masala. Serve immediately.', null, null, 'Finish'),
  ('00000000-0000-0000-0002-000000000002', 1, 'human',   'Mix flour and water until no dry flour remains.', 300, null, 'Autolyse'),
  ('00000000-0000-0000-0002-000000000002', 2, 'passive', 'Rest covered at room temperature.', 1800, null, 'Autolyse'),
  ('00000000-0000-0000-0002-000000000002', 3, 'human',   'Add starter and salt. Fold to incorporate fully.', 600, null, 'Mix & bulk ferment'),
  ('00000000-0000-0000-0002-000000000002', 4, 'human',   'Perform 4 sets of stretch-and-fold at 30 min intervals.', 600, null, 'Mix & bulk ferment'),
  ('00000000-0000-0000-0002-000000000002', 5, 'passive', 'Bulk ferment at room temperature until dough has risen 50–75%.', 18000, null, 'Mix & bulk ferment'),
  ('00000000-0000-0000-0002-000000000002', 6, 'human',   'Pre-shape into a round. Bench rest, then final shape. Place in floured banneton seam-side up.', 1200, null, 'Shape'),
  ('00000000-0000-0000-0002-000000000002', 7, 'passive', 'Cover and refrigerate overnight.', 43200, null, 'Cold retard'),
  ('00000000-0000-0000-0002-000000000002', 8, 'machine', 'Place Dutch oven in oven and preheat.', 2700, 260, 'Bake'),
  ('00000000-0000-0000-0002-000000000002', 9, 'human',   'Score loaf with lame. Bake covered, then uncover and continue until deep golden.', 2700, null, 'Bake')
on conflict do nothing;

-- ── Recipe Equipment ──────────────────────────────────────────
insert into recipe_equipment (recipe_id, equipment_id, required, alternatives) values
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001', true,  null),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000002', false, array['wooden skewers (soaked)']),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000003', true,  null),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000004', true,  null),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000010', true,  null),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000011', false, array['bowl lined with floured cloth']),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000012', false, null),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000013', true,  null)
on conflict do nothing;
