-- Seed global tasks — one representative task per family
-- These are used by the recipe editor's task picker and AI import

insert into tasks (id, slug, name, family, task_type, description, status)
values
  ('task-cut-0000-0000-0000-000000000001', 'chop',        'Chop',         'cut',          'human',   'Cut into pieces',                    'global'),
  ('task-cut-0000-0000-0000-000000000002', 'slice',        'Slice',        'cut',          'human',   'Cut into thin slices',               'global'),
  ('task-cut-0000-0000-0000-000000000003', 'dice',         'Dice',         'cut',          'human',   'Cut into small cubes',               'global'),
  ('task-cut-0000-0000-0000-000000000004', 'mince',        'Mince',        'cut',          'human',   'Cut into very fine pieces',          'global'),
  ('task-cut-0000-0000-0000-000000000005', 'peel',         'Peel',         'cut',          'human',   'Remove outer skin or rind',          'global'),
  ('task-cut-0000-0000-0000-000000000006', 'grate',        'Grate',        'cut',          'human',   'Shred using a grater',               'global'),
  ('task-cut-0000-0000-0000-000000000007', 'julienne',     'Julienne',     'cut',          'human',   'Cut into thin matchstick strips',    'global'),

  ('task-move-0000-0000-0000-000000000001', 'pour',        'Pour',         'move',         'human',   'Transfer a liquid',                  'global'),
  ('task-move-0000-0000-0000-000000000002', 'strain',      'Strain',       'move',         'human',   'Separate solids from liquid',        'global'),
  ('task-move-0000-0000-0000-000000000003', 'drain',       'Drain',        'move',         'human',   'Remove liquid',                      'global'),
  ('task-move-0000-0000-0000-000000000004', 'transfer',    'Transfer',     'move',         'human',   'Move from one vessel to another',    'global'),
  ('task-move-0000-0000-0000-000000000005', 'plate',       'Plate',        'move',         'human',   'Arrange food on a plate',            'global'),

  ('task-hdry-0000-0000-0000-000000000001', 'fry',         'Fry',          'heat_dry',     'human',   'Cook in hot oil or fat',             'global'),
  ('task-hdry-0000-0000-0000-000000000002', 'sear',        'Sear',         'heat_dry',     'human',   'Brown surface at high heat',         'global'),
  ('task-hdry-0000-0000-0000-000000000003', 'roast',       'Roast',        'heat_dry',     'human',   'Cook in dry oven heat',              'global'),
  ('task-hdry-0000-0000-0000-000000000004', 'grill',       'Grill',        'heat_dry',     'human',   'Cook over direct heat',              'global'),
  ('task-hdry-0000-0000-0000-000000000005', 'toast',       'Toast',        'heat_dry',     'human',   'Brown surface with dry heat',        'global'),
  ('task-hdry-0000-0000-0000-000000000006', 'saute',       'Sauté',        'heat_dry',     'human',   'Cook quickly in a little fat',       'global'),
  ('task-hdry-0000-0000-0000-000000000007', 'bake',        'Bake',         'heat_dry',     'machine', 'Cook in oven with dry heat',         'global'),

  ('task-hwet-0000-0000-0000-000000000001', 'boil',        'Boil',         'heat_wet',     'human',   'Cook in boiling water',              'global'),
  ('task-hwet-0000-0000-0000-000000000002', 'simmer',      'Simmer',       'heat_wet',     'human',   'Cook in liquid just below boil',     'global'),
  ('task-hwet-0000-0000-0000-000000000003', 'steam',       'Steam',        'heat_wet',     'human',   'Cook using steam',                   'global'),
  ('task-hwet-0000-0000-0000-000000000004', 'poach',       'Poach',        'heat_wet',     'human',   'Cook gently in liquid',              'global'),
  ('task-hwet-0000-0000-0000-000000000005', 'blanch',      'Blanch',       'heat_wet',     'human',   'Briefly boil then cool',             'global'),
  ('task-hwet-0000-0000-0000-000000000006', 'braise',      'Braise',       'heat_wet',     'human',   'Cook slowly in liquid',              'global'),

  ('task-hmac-0000-0000-0000-000000000001', 'bake-oven',   'Bake (oven)',  'heat_machine', 'machine', 'Cook in oven',                       'global'),
  ('task-hmac-0000-0000-0000-000000000002', 'microwave',   'Microwave',    'heat_machine', 'machine', 'Cook using microwave',               'global'),
  ('task-hmac-0000-0000-0000-000000000003', 'air-fry',     'Air fry',      'heat_machine', 'machine', 'Cook in air fryer',                  'global'),
  ('task-hmac-0000-0000-0000-000000000004', 'sous-vide',   'Sous vide',    'heat_machine', 'machine', 'Cook in temperature-controlled bath','global'),

  ('task-mix-0000-0000-0000-000000000001',  'whisk',       'Whisk',        'mix',          'human',   'Beat rapidly with a whisk',          'global'),
  ('task-mix-0000-0000-0000-000000000002',  'stir',        'Stir',         'mix',          'human',   'Mix with circular motion',           'global'),
  ('task-mix-0000-0000-0000-000000000003',  'fold',        'Fold',         'mix',          'human',   'Gently incorporate with folding motion','global'),
  ('task-mix-0000-0000-0000-000000000004',  'knead',       'Knead',        'mix',          'human',   'Work dough with hands',              'global'),
  ('task-mix-0000-0000-0000-000000000005',  'blend',       'Blend',        'mix',          'machine', 'Blend using a blender',              'global'),
  ('task-mix-0000-0000-0000-000000000006',  'mix',         'Mix',          'mix',          'human',   'Combine ingredients together',       'global'),

  ('task-pass-0000-0000-0000-000000000001', 'rest',        'Rest',         'passive',      'passive', 'Allow to rest undisturbed',          'global'),
  ('task-pass-0000-0000-0000-000000000002', 'marinate',    'Marinate',     'passive',      'passive', 'Soak in marinade',                   'global'),
  ('task-pass-0000-0000-0000-000000000003', 'chill',       'Chill',        'passive',      'passive', 'Cool in refrigerator',               'global'),
  ('task-pass-0000-0000-0000-000000000004', 'proof',       'Proof',        'passive',      'passive', 'Allow dough to rise',                'global'),
  ('task-pass-0000-0000-0000-000000000005', 'ferment',     'Ferment',      'passive',      'passive', 'Allow fermentation to occur',        'global'),
  ('task-pass-0000-0000-0000-000000000006', 'soak',        'Soak',         'passive',      'passive', 'Submerge in liquid for a period',    'global'),

  ('task-prep-0000-0000-0000-000000000001', 'measure',     'Measure',      'prepare',      'human',   'Measure out ingredients',            'global'),
  ('task-prep-0000-0000-0000-000000000002', 'preheat',     'Preheat',      'prepare',      'machine', 'Heat appliance to target temperature','global'),
  ('task-prep-0000-0000-0000-000000000003', 'season',      'Season',       'prepare',      'human',   'Add salt, pepper or other seasoning','global'),
  ('task-prep-0000-0000-0000-000000000004', 'wash',        'Wash',         'prepare',      'human',   'Clean under running water',          'global'),
  ('task-prep-0000-0000-0000-000000000005', 'bring-to-boil','Bring to boil','prepare',     'human',   'Heat liquid until boiling',          'global'),

  ('task-fin-0000-0000-0000-000000000001',  'garnish',     'Garnish',      'finish',       'human',   'Add final decorative elements',      'global'),
  ('task-fin-0000-0000-0000-000000000002',  'serve',       'Serve',        'finish',       'human',   'Present the finished dish',          'global'),
  ('task-fin-0000-0000-0000-000000000003',  'dress',       'Dress',        'finish',       'human',   'Add dressing or sauce to finish',    'global'),
  ('task-fin-0000-0000-0000-000000000004',  'assemble',    'Assemble',     'finish',       'human',   'Put components together',            'global')

on conflict (id) do nothing;
