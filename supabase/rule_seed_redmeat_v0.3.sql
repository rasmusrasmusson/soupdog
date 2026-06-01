-- ═══════════════════════════════════════════════════════════════════════════
--  SEED: RED-MEAT RULE LIBRARY — strawman v0.3 (RECONCILED against live schema)
--  Illustrative values; every row carries an evidence grade + source.
--  Uses live food_state values and the new culinary_role vocabulary.
-- ═══════════════════════════════════════════════════════════════════════════

-- PREREQUISITE (run once, on the live ingredients table — see schema MIGRATION TODO):
--   alter table ingredients add column if not exists culinary_role culinary_role;
-- Then classify the functional ingredients used by scaling rules, e.g.:
--   update ingredients set culinary_role='salt'    where name ilike 'salt';
--   update ingredients set culinary_role='leavening' where name ilike any(array['baking soda','baking powder','yeast']);
--   update ingredients set culinary_role='aromatic'  where name ilike any(array['garlic','onion','ginger','shallot']);

-- 1. Families ----------------------------------------------------------------
insert into food_families (slug, name, domain, connective_tissue, default_method, evidence_grade, evidence_source) values
('redmeat_tender',   'Tender / low-collagen red meat', 'red_meat', 'low',    'dry_heat', 'e1_literature', 'OpenTextBC Meat Cutting ch.2'),
('redmeat_moderate', 'Moderate red meat',              'red_meat', 'medium', 'dry_heat', 'e1_literature', 'OpenTextBC Meat Cutting ch.2'),
('redmeat_tough',    'Tough / high-collagen red meat', 'red_meat', 'high',   'low_slow', 'e1_literature', 'OpenTextBC Meat Cutting ch.2; McGee')
on conflict (slug) do nothing;

-- 2. Membership (resolves ingredient ids by name from the live ingredients table)
insert into food_family_members (family_id, ingredient_id, attributes, evidence_grade, evidence_source)
select f.id, i.id, m.attrs::jsonb, 'e1_literature', 'OpenTextBC Meat Cutting ch.2'
from (values
  ('redmeat_tender',   'ribeye',      '{"typical_thickness_mm":30,"fat_pct":18}'),
  ('redmeat_tender',   'striploin',   '{"typical_thickness_mm":28,"fat_pct":12}'),
  ('redmeat_tender',   'tenderloin',  '{"typical_thickness_mm":40,"fat_pct":8}'),
  ('redmeat_tender',   'top sirloin', '{"typical_thickness_mm":25,"fat_pct":10}'),
  ('redmeat_moderate', 'flank',       '{"typical_thickness_mm":15,"fat_pct":8}'),
  ('redmeat_moderate', 'skirt',       '{"typical_thickness_mm":12,"fat_pct":12}'),
  ('redmeat_moderate', 'tri-tip',     '{"typical_thickness_mm":35,"fat_pct":10}'),
  ('redmeat_tough',    'brisket',     '{"typical_thickness_mm":60,"fat_pct":20}'),
  ('redmeat_tough',    'chuck',       '{"typical_thickness_mm":50,"fat_pct":18}'),
  ('redmeat_tough',    'shank',       '{"typical_thickness_mm":45,"fat_pct":6}'),
  ('redmeat_tough',    'short rib',   '{"typical_thickness_mm":40,"fat_pct":25}')
) as m(family_slug, ing_name, attrs)
join food_families f on f.slug = m.family_slug
join ingredients   i on i.name ilike m.ing_name and i.category = 'meat'
on conflict (family_id, ingredient_id) do nothing;

-- 3. Transfer guard ----------------------------------------------------------
insert into family_transfer_rules (from_family_id, to_family_id, transfer, adjustment_note, evidence_grade, evidence_source)
select a.id, b.id, t.transfer, t.note, t.grade::evidence_grade, t.src
from (values
  ('redmeat_tender',   'redmeat_moderate', 'with_adjustment', 'adjust for thickness/grain; timing differs', 'e2_expert', 'chef heuristic'),
  ('redmeat_tender',   'redmeat_tough',    'forbidden',       'collagen-rich cuts need moist/low-slow; dry-heat doneness logic does not apply', 'e1_literature', 'McGee; OpenTextBC'),
  ('redmeat_moderate', 'redmeat_tough',    'forbidden',       'as above', 'e1_literature', 'McGee; OpenTextBC')
) as t(from_slug, to_slug, transfer, note, grade, src)
join food_families a on a.slug = t.from_slug
join food_families b on b.slug = t.to_slug
on conflict (from_family_id, to_family_id) do nothing;

-- 4. Doneness target states --------------------------------------------------
insert into target_state_rules (domain, axis, state_name, target_temp_celsius, target_temp_range_c, evidence_grade, evidence_source) values
('red_meat','doneness','rare',         52.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','medium_rare',  57.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','medium',       63.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','medium_well',  68.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','well_done',    71.0, 2.0, 'e1_literature', 'standard culinary references')
on conflict (domain, axis, state_name, family_id) do nothing;

-- 5. Method breakpoints (tender cuts) ----------------------------------------
insert into method_rules (family_id, domain, breakpoint_kind, breakpoint_value, below_method, at_or_above_method, capacity_basis, evidence_grade, evidence_source)
select f.id, 'red_meat', v.kind, v.val, 'single_pan_sear', 'oven_reverse_sear_then_batch_finish', 'equipment_capacity', 'e2_expert', 'chef interview (illustrative)'
from (values ('piece_count', 4::numeric), ('total_mass_g', 1200::numeric)) as v(kind, val)
join food_families f on f.slug = 'redmeat_tender'
on conflict (domain, family_id, breakpoint_kind) do nothing;

-- 6. Sub-linear scaling — keyed on culinary_role (NOT ingredient_category) ----
insert into scaling_factor_rules (applies_to_role, factor_curve, notes, evidence_grade, evidence_source) values
('salt',      '{"type":"power","exponent":0.85}', 'salt scales sub-linearly with batch', 'e2_expert', 'chef heuristic'),
('spice_seasoning', '{"type":"power","exponent":0.70}', 'spices scale sub-linearly',     'e2_expert', 'chef heuristic'),
('leavening', '{"type":"power","exponent":0.80}', 'leavening scales sub-linearly',       'e2_expert', 'baking references'),
('aromatic',  '{"type":"power","exponent":0.90}', 'aromatics scale near-linearly, slight taper', 'e2_expert', 'chef heuristic')
on conflict (applies_to_role) do nothing;

-- 7. Nutrient transformation — food_class-aware ------------------------------
insert into nutrient_transform_rules (method, nutrient, food_class, retention_factor, duration_seconds_ref, basis, notes, evidence_grade, evidence_source) values
('boil','vitamin_c',   null,        0.50, 600,  'per_100g', 'general water-soluble leaching ~10min', 'e1_literature', 'USDA retention factors'),
('steam','vitamin_c',  null,        0.75, 600,  'per_100g', 'less leaching than boiling',            'e1_literature', 'USDA retention factors'),
('fry','fat',          null,        1.30, null, 'per_100g', 'fat uptake during frying',              'e1_literature', 'USDA retention factors'),
('dehydrate','energy', null,        3.50, null, 'per_100g', 'water removed; density rises',          'e1_literature', 'calculated from mass loss'),
('boil','vitamin_c',   'leafy_veg', 0.35, 600,  'per_100g', 'leafy greens leach more',               'e1_literature', 'USDA retention factors'),
('boil','vitamin_c',   'root_veg',  0.60, 1200, 'per_100g', 'denser roots retain more',              'e1_literature', 'USDA retention factors')
on conflict (method, nutrient, food_class) do nothing;

-- 8. Starter materialization policy ------------------------------------------
insert into materialization_policies (scope_kind, scope_id, preexpand_axes, state_granularity, notes) values
('global_default', null, array['doneness'], 'coarse', 'consumer default: pre-expand doneness only, coarse states')
on conflict (scope_kind, scope_id) do nothing;
