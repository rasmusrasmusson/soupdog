-- ═══════════════════════════════════════════════════════════════
--  Soupdog — Seed Data v2
--  Mirrors the new schema: recipe_canonicals + recipe_versions
--  Legacy recipes table is also populated for compatibility.
-- ═══════════════════════════════════════════════════════════════

-- ── Ingredients (expanded with nutrition + category) ──────────
insert into ingredients (id, slug, name, description, category, allergens, nutrition_per_100g, nutrition_source, typical_unit) values
  ('00000000-0000-0000-0000-000000000001', 'chicken-thigh',      'Chicken thigh',        'Boneless skinless chicken thigh.', 'meat',   null,           '{"calories":177,"protein":20.0,"fat":10.9,"carbohydrates":0,"fiber":0,"sodium":75}'::jsonb,  'usda', 'g'),
  ('00000000-0000-0000-0000-000000000002', 'full-fat-yogurt',    'Full-fat yogurt',       'Plain full-fat yogurt.',           'dairy',  array['milk'],  '{"calories":61,"protein":3.5,"fat":3.3,"carbohydrates":4.7,"fiber":0,"sodium":46}'::jsonb,   'usda', 'ml'),
  ('00000000-0000-0000-0000-000000000003', 'tikka-curry-paste',  'Tikka curry paste',     'Spiced curry paste base.',         'condiment', null,         '{"calories":150,"protein":3.0,"fat":10.0,"carbohydrates":12.0,"fiber":2.0,"sodium":900}'::jsonb,'usda', 'g'),
  ('00000000-0000-0000-0000-000000000004', 'tomato-passata',     'Tomato passata',        'Smooth sieved tomatoes.',          'vegetable', null,         '{"calories":25,"protein":1.6,"fat":0.3,"carbohydrates":4.5,"fiber":1.1,"sodium":8}'::jsonb,  'usda', 'ml'),
  ('00000000-0000-0000-0000-000000000005', 'heavy-cream',        'Heavy cream',           'High-fat cream.',                  'dairy',  array['milk'],  '{"calories":340,"protein":2.1,"fat":36.0,"carbohydrates":2.9,"fiber":0,"sodium":27}'::jsonb,  'usda', 'ml'),
  ('00000000-0000-0000-0000-000000000006', 'ground-ginger',      'Ground ginger',         'Dried ground ginger root.',        'spice',  null,           '{"calories":335,"protein":8.98,"fat":4.24,"carbohydrates":71.6,"fiber":14.1,"sodium":13}'::jsonb,'usda', 'g'),
  ('00000000-0000-0000-0000-000000000007', 'garam-masala',       'Garam masala',          'Aromatic spice blend.',            'spice',  null,           '{"calories":379,"protein":14.6,"fat":14.4,"carbohydrates":51.0,"fiber":17.8,"sodium":36}'::jsonb,'usda', 'g'),
  ('00000000-0000-0000-0000-000000000008', 'kosher-salt',        'Kosher salt',           'Coarse salt.',                     'other',  null,           '{"calories":0,"protein":0,"fat":0,"carbohydrates":0,"fiber":0,"sodium":38758}'::jsonb,         'usda', 'g'),
  ('00000000-0000-0000-0000-000000000009', 'onion',              'Onion',                 'Brown onion.',                     'vegetable', null,         '{"calories":40,"protein":1.1,"fat":0.1,"carbohydrates":9.3,"fiber":1.7,"sodium":4}'::jsonb,   'usda', 'g'),
  ('00000000-0000-0000-0000-000000000010', 'garlic',             'Garlic',                'Fresh garlic cloves.',             'vegetable', null,         '{"calories":149,"protein":6.4,"fat":0.5,"carbohydrates":33.1,"fiber":2.1,"sodium":17}'::jsonb, 'usda', 'g'),
  ('00000000-0000-0000-0000-000000000011', 'neutral-oil',        'Neutral oil',           'Flavourless cooking oil.',         'oil',    null,           '{"calories":884,"protein":0,"fat":100,"carbohydrates":0,"fiber":0,"sodium":0}'::jsonb,          'usda', 'ml'),
  ('00000000-0000-0000-0000-000000000020', 'bread-flour',        'Bread flour',           'High-protein flour.',              'grain',  array['gluten'],'{"calories":361,"protein":12.0,"fat":1.7,"carbohydrates":73.0,"fiber":2.7,"sodium":2}'::jsonb,  'usda', 'g'),
  ('00000000-0000-0000-0000-000000000021', 'water',              'Water',                 'Filtered water.',                  'liquid', null,           '{"calories":0,"protein":0,"fat":0,"carbohydrates":0,"fiber":0,"sodium":0}'::jsonb,              'usda', 'ml'),
  ('00000000-0000-0000-0000-000000000022', 'sourdough-starter',  'Sourdough starter',     'Active levain, 100% hydration.',   'grain',  array['gluten'],'{"calories":80,"protein":3.0,"fat":0.4,"carbohydrates":16.0,"fiber":0.5,"sodium":3}'::jsonb,   'calculated', 'g'),
  ('00000000-0000-0000-0000-000000000023', 'salt',               'Salt',                  'Fine sea salt.',                   'other',  null,           '{"calories":0,"protein":0,"fat":0,"carbohydrates":0,"fiber":0,"sodium":38758}'::jsonb,         'usda', 'g')
on conflict (slug) do nothing;

-- ── Equipment ─────────────────────────────────────────────────
insert into equipment (id, slug, name, category, description, connected) values
  ('00000000-0000-0000-0001-000000000001', 'grill-broiler',      'Grill or broiler',       'oven',  'High-heat grill or oven broiler.', false),
  ('00000000-0000-0000-0001-000000000002', 'metal-skewers',      'Metal skewers',          'other', 'Flat metal skewers for grilling.', false),
  ('00000000-0000-0000-0001-000000000003', 'heavy-bottomed-pan', 'Heavy-bottomed pan',     'pan',   'Wide heavy pan for sauces.',       false),
  ('00000000-0000-0000-0001-000000000004', 'mixing-bowl',        'Mixing bowl',            'other', 'Large bowl for marinating.',       false),
  ('00000000-0000-0000-0001-000000000010', 'dutch-oven',         'Dutch oven (cast iron)', 'pan',   'Heavy cast iron pot with lid.',    false),
  ('00000000-0000-0000-0001-000000000011', 'banneton',           'Banneton',               'other', 'Proofing basket for sourdough.',   false),
  ('00000000-0000-0000-0001-000000000012', 'bench-scraper',      'Bench scraper',          'other', 'Metal scraper for dough.',         false),
  ('00000000-0000-0000-0001-000000000013', 'lame',               'Lame or sharp blade',    'knife', 'Razor blade for scoring bread.',   false)
on conflict (slug) do nothing;

-- ── Recipe canonicals ─────────────────────────────────────────
insert into recipe_canonicals (id, slug, is_published, source) values
  ('00000000-0000-0000-0003-000000000001', 'chicken-tikka-masala', true, 'human_authored'),
  ('00000000-0000-0000-0003-000000000002', 'sourdough-loaf',       true, 'human_authored')
on conflict (slug) do nothing;

-- ── Recipe versions ───────────────────────────────────────────
insert into recipe_versions (id, canonical_id, version_number, title, description, cuisine, tags, base_servings, difficulty, total_time_seconds, active_time_seconds, passive_time_seconds, nutrition_per_serving, is_canonical_version) values
  (
    '00000000-0000-0000-0004-000000000001',
    '00000000-0000-0000-0003-000000000001',
    1,
    'Chicken Tikka Masala',
    'A richly spiced tomato-cream curry. Marinade and char the chicken first, then finish in a slow-reduced masala sauce.',
    'Indian', array['curry','chicken','dinner','spiced'],
    4, 'medium', 5400, 3600, 1800,
    '{"calories":520,"protein":42,"fat":28,"carbohydrates":18,"fiber":3,"sodium":680}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0004-000000000002',
    '00000000-0000-0000-0003-000000000002',
    1,
    'Sourdough Loaf',
    'Open crumb, blistered crust. 75% hydration dough, cold retarded overnight, baked in a Dutch oven.',
    'European', array['bread','fermented','baking','passive'],
    10, 'hard', 86400, 5400, 81000,
    '{"calories":210,"protein":7,"fat":1,"carbohydrates":42,"fiber":2,"sodium":390}'::jsonb,
    true
  )
on conflict (canonical_id, version_number) do nothing;

-- Update current_version_id pointers
update recipe_canonicals set current_version_id = '00000000-0000-0000-0004-000000000001' where id = '00000000-0000-0000-0003-000000000001';
update recipe_canonicals set current_version_id = '00000000-0000-0000-0004-000000000002' where id = '00000000-0000-0000-0003-000000000002';

-- ── Version ingredients ───────────────────────────────────────
insert into version_ingredients (version_id, ingredient_id, quantity_value, quantity_unit, food_state, prep_note, optional, order_index) values
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', 800, 'g', 'refrigerated', 'boneless, skinless, cut into chunks', false, 1),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000002', 150, 'ml', null, null, false, 2),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000003', 60,  'g',  null, null, false, 3),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000004', 400, 'ml', null, null, false, 4),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000005', 100, 'ml', null, null, false, 5),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000006', 5,   'g',  null, null, false, 6),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000007', 8,   'g',  null, null, false, 7),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000008', 8,   'g',  null, null, false, 8),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000009', 200, 'g',  null, 'finely diced', false, 9),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000010', 20,  'g',  null, 'minced', false, 10),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000011', 30,  'ml', null, null, false, 11),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000020', 500, 'g', null, null, false, 1),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000021', 375, 'ml', null, 'at 35°C', false, 2),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000022', 100, 'g', null, 'active, at peak', false, 3),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000023', 10,  'g', null, null, false, 4)
on conflict do nothing;

-- ── Version steps ─────────────────────────────────────────────
insert into version_steps (id, version_id, order_index, step_type, instruction, duration_seconds, temperature_celsius, group_label) values
  ('00000000-0000-0000-0005-000000000101', '00000000-0000-0000-0004-000000000001', 1, 'human',   'Combine yogurt, curry paste, garam masala, and 4g salt. Coat chicken thoroughly.',                                  null, null,  'Marinade'),
  ('00000000-0000-0000-0005-000000000102', '00000000-0000-0000-0004-000000000001', 2, 'passive', 'Cover and refrigerate to marinate.',                                                                                  1800, null,  'Marinade'),
  ('00000000-0000-0000-0005-000000000103', '00000000-0000-0000-0004-000000000001', 3, 'machine', 'Preheat grill or oven broiler to maximum heat.',                                                                      null, 250,   'Char chicken'),
  ('00000000-0000-0000-0005-000000000104', '00000000-0000-0000-0004-000000000001', 4, 'human',   'Thread chicken onto skewers. Grill, turning once, until charred at edges and cooked through.',                       600,  null,  'Char chicken'),
  ('00000000-0000-0000-0005-000000000105', '00000000-0000-0000-0004-000000000001', 5, 'human',   'Heat oil in pan. Sauté onion and garlic until deep golden.',                                                         720,  null,  'Masala sauce'),
  ('00000000-0000-0000-0005-000000000106', '00000000-0000-0000-0004-000000000001', 6, 'human',   'Add passata and ground ginger. Simmer to reduce and concentrate.',                                                   1200, null,  'Masala sauce'),
  ('00000000-0000-0000-0005-000000000107', '00000000-0000-0000-0004-000000000001', 7, 'human',   'Add grilled chicken to sauce. Stir in cream. Simmer briefly.',                                                       300,  null,  'Finish'),
  ('00000000-0000-0000-0005-000000000108', '00000000-0000-0000-0004-000000000001', 8, 'human',   'Adjust salt. Finish with remaining garam masala. Serve immediately.',                                                null,  null, 'Finish'),
  ('00000000-0000-0000-0005-000000000201', '00000000-0000-0000-0004-000000000002', 1, 'human',   'Mix flour and water until no dry flour remains.',                                                                     300,  null,  'Autolyse'),
  ('00000000-0000-0000-0005-000000000202', '00000000-0000-0000-0004-000000000002', 2, 'passive', 'Rest covered at room temperature.',                                                                                   1800, null,  'Autolyse'),
  ('00000000-0000-0000-0005-000000000203', '00000000-0000-0000-0004-000000000002', 3, 'human',   'Add starter and salt. Fold to incorporate fully.',                                                                   600,  null,  'Bulk ferment'),
  ('00000000-0000-0000-0005-000000000204', '00000000-0000-0000-0004-000000000002', 4, 'human',   'Perform 4 sets of stretch-and-fold at 30 min intervals.',                                                            600,  null,  'Bulk ferment'),
  ('00000000-0000-0000-0005-000000000205', '00000000-0000-0000-0004-000000000002', 5, 'passive', 'Bulk ferment at room temperature until dough has risen 50–75%.',                                                    18000, null, 'Bulk ferment'),
  ('00000000-0000-0000-0005-000000000206', '00000000-0000-0000-0004-000000000002', 6, 'human',   'Pre-shape into a round. Bench rest, then final shape. Place in floured banneton seam-side up.',                     1200, null,  'Shape'),
  ('00000000-0000-0000-0005-000000000207', '00000000-0000-0000-0004-000000000002', 7, 'passive', 'Cover and refrigerate overnight.',                                                                                   43200, null, 'Cold retard'),
  ('00000000-0000-0000-0005-000000000208', '00000000-0000-0000-0004-000000000002', 8, 'machine', 'Place Dutch oven in oven and preheat.',                                                                              2700, 260,   'Bake'),
  ('00000000-0000-0000-0005-000000000209', '00000000-0000-0000-0004-000000000002', 9, 'human',   'Score loaf with lame. Bake covered 20 min, then uncover and continue until deep golden.',                           2700, null,  'Bake')
on conflict do nothing;

-- ── Version equipment ─────────────────────────────────────────
insert into version_equipment (version_id, equipment_id, required, alternatives) values
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0001-000000000001', true,  null),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0001-000000000002', false, array['wooden skewers (soaked)']),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0001-000000000003', true,  null),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0001-000000000004', true,  null),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0001-000000000010', true,  null),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0001-000000000011', false, array['bowl lined with floured cloth']),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0001-000000000012', false, null),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0001-000000000013', true,  null)
on conflict do nothing;

-- ── Canonical execution variants (base servings, SI) ─────────
insert into execution_variants (id, version_id, servings, unit_system, is_canonical_variant) values
  ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0004-000000000001', 4,  'si', true),
  ('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0004-000000000002', 10, 'si', true)
on conflict do nothing;

-- ── Legacy recipes table (compatibility) ──────────────────────
insert into recipes (id, slug, version, title, description, cuisine, tags, servings, difficulty, total_time_seconds, active_time_seconds, passive_time_seconds, nutrition, is_published, recipe_version_id) values
  (
    '00000000-0000-0000-0002-000000000001',
    'chicken-tikka-masala', 1,
    'Chicken Tikka Masala',
    'A richly spiced tomato-cream curry. Marinade and char the chicken first, then finish in a slow-reduced masala sauce.',
    'Indian', array['curry','chicken','dinner','spiced'],
    4, 'medium', 5400, 3600, 1800,
    '{"calories":520,"protein":42,"fat":28,"carbohydrates":18,"fiber":3,"sodium":680}'::jsonb,
    true,
    '00000000-0000-0000-0004-000000000001'
  ),
  (
    '00000000-0000-0000-0002-000000000002',
    'sourdough-loaf', 1,
    'Sourdough Loaf',
    'Open crumb, blistered crust. 75% hydration dough, cold retarded overnight, baked in a Dutch oven.',
    'European', array['bread','fermented','baking','passive'],
    10, 'hard', 86400, 5400, 81000,
    '{"calories":210,"protein":7,"fat":1,"carbohydrates":42,"fiber":2,"sodium":390}'::jsonb,
    true,
    '00000000-0000-0000-0004-000000000002'
  )
on conflict (slug) do nothing;

-- Legacy recipe_ingredients
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

-- Legacy recipe_steps
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

-- Legacy recipe_equipment
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
