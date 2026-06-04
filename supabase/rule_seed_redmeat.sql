-- ═══════════════════════════════════════════════════════════════════════════
--  SEED: RED-MEAT RULE LIBRARY (worked example, E1 literature-grade)
--  Illustrative values. Every row carries an evidence grade + source.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Families ----------------------------------------------------------------
insert into food_families (slug, name, domain, connective_tissue, default_method, evidence_grade, evidence_source) values
('redmeat_tender',   'Tender / low-collagen red meat',   'red_meat', 'low',    'dry_heat',  'e1_literature', 'OpenTextBC Meat Cutting ch.2'),
('redmeat_moderate', 'Moderate red meat',                'red_meat', 'medium', 'dry_heat',  'e1_literature', 'OpenTextBC Meat Cutting ch.2'),
('redmeat_tough',    'Tough / high-collagen red meat',   'red_meat', 'high',   'low_slow',  'e1_literature', 'OpenTextBC Meat Cutting ch.2; McGee');

-- 2. Membership (ingredient_id refs elided as :ribeye etc. for readability) --
-- insert into food_family_members (family_id, ingredient_id, attributes, ...) :
--   tender:   ribeye {thickness_mm:30,fat_pct:18}, striploin, tenderloin, top_sirloin
--   moderate: flank, skirt, tri_tip
--   tough:    brisket, chuck, shank, short_rib

-- 3. THE TRANSFER GUARD ------------------------------------------------------
-- tender <-> tender: free; tender -> tough: FORBIDDEN (the steak-braise error)
insert into family_transfer_rules (from_family_id, to_family_id, transfer, adjustment_note, evidence_grade, evidence_source)
select a.id, b.id, 'free', null, 'e2_expert', 'within-family transfer safe'
  from food_families a, food_families b
 where a.slug='redmeat_tender' and b.slug='redmeat_tender';

insert into family_transfer_rules (from_family_id, to_family_id, transfer, adjustment_note, evidence_grade, evidence_source)
select a.id, b.id, 'forbidden', 'collagen-rich cuts need moist/low-slow; dry-heat doneness logic does not apply', 'e1_literature', 'McGee; OpenTextBC'
  from food_families a, food_families b
 where a.slug='redmeat_tender' and b.slug='redmeat_tough';

-- 4. Doneness target states (near-constant across red meat) -------------------
insert into target_state_rules (domain, axis, state_name, target_temp_celsius, target_temp_range_c, evidence_grade, evidence_source) values
('red_meat','doneness','rare',         52.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','medium_rare',  57.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','medium',       63.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','medium_well',  68.0, 1.5, 'e1_literature', 'standard culinary references'),
('red_meat','doneness','well_done',    71.0, 2.0, 'e1_literature', 'standard culinary references');

-- 5. Method breakpoint (the ribeye-for-12 insight) ---------------------------
-- For tender cuts: above ~4 pieces OR ~1.2kg, single-pan sear becomes
-- oven-then-batch-finish.
-- insert into method_rules (domain, family_id=tender, breakpoint_kind, breakpoint_value,
--   below_method, at_or_above_method, evidence_grade, evidence_source) values
--   ('red_meat', :tender, 'piece_count', 4, 'single_pan_sear', 'oven_reverse_sear_then_batch', 'e2_expert', 'chef interview');

-- 6. Sub-linear scaling (spices etc.) ----------------------------------------
insert into scaling_factor_rules (applies_to, factor_curve, notes, evidence_grade, evidence_source) values
('salt',      '{"type":"power","exponent":0.85}', 'salt scales sub-linearly with batch', 'e2_expert', 'chef heuristic'),
('spice',     '{"type":"power","exponent":0.70}', 'spices scale sub-linearly',           'e2_expert', 'chef heuristic'),
('leavening', '{"type":"power","exponent":0.80}', 'leavening scales sub-linearly',       'e2_expert', 'baking references');

-- 7. Nutrient transformation (method-aware nutrition) ------------------------
insert into nutrient_transform_rules (method, nutrient, retention_factor, basis, notes, evidence_grade, evidence_source) values
('boil','vitamin_c',     0.50, 'per_100g', 'water-soluble leaching', 'e1_literature', 'USDA retention factors'),
('steam','vitamin_c',    0.80, 'per_100g', 'less leaching than boil','e1_literature', 'USDA retention factors'),
('fry','fat',            1.30, 'per_100g', 'fat uptake during frying','e1_literature','USDA retention factors'),
('dehydrate','energy',   3.50, 'per_100g', 'water removed; energy density concentrates','e1_literature','calculated from mass loss');
