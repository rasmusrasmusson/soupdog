-- guide_01_core_task_seed.sql  (v2 — richer model: typed completion + heat mechanism/medium)
-- Phase A, step 1. Run AFTER guide_00_task_schema.sql.
-- Blesses + enriches the CORE everyday transformations. PROPOSAL — review.
-- Autocommit style (no BEGIN). UPDATEs match by name; INSERT uses NOT EXISTS.

-- 0) CLEAN UP lowercase AI dupes (map by METHOD, not blind merge).
update version_steps set task_id=(select id from tasks where name='Sauté' limit 1)
 where task_id=(select id from tasks where name='fry' limit 1);
delete from tasks where name='fry';
update version_steps set task_id=(select id from tasks where name='Mix' limit 1)
 where task_id=(select id from tasks where name='combine' limit 1);
delete from tasks where name='combine';

-- 1) ADD "Bring to a boil" (distinct from Boil).
insert into tasks (slug,name,family,task_family,category,task_type,description,
  completion_type,completion_target,completion_criterion,
  min_duration_seconds,max_duration_seconds,typical_input_state,typical_output_state,
  heat_mechanism,heat_medium,suggested_tool_slugs,is_passive,is_parallelisable,source,is_verified)
select 'bring-to-a-boil','Bring to a boil','other','other','boil','human',
  'Heat a liquid until it reaches a rolling boil. A state change of the liquid; no fixed time. Food is added after, in a separate Boil step.',
  'structural','rolling boil','until boiling (large bubbles break the surface continuously)',
  120,600,'liquid','boiling liquid','conduction','water',
  array['large-pot','stock-pot'],false,true,'human_authored',true
where not exists (select 1 from tasks where name='Bring to a boil');

-- 2) ENRICH + BLESS the core.
update tasks set is_verified=true,category='boil',heat_mechanism='conduction',heat_medium='water',
  description='Cook food submerged in boiling liquid until done.',
  completion_type='texture',completion_target='tender / al dente',
  completion_criterion='until tender / cooked through (e.g. al dente for pasta)',
  min_duration_seconds=180,max_duration_seconds=900,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['large-pot','stock-pot'] where name='Boil';
update tasks set is_verified=true,category='simmer',heat_mechanism='conduction',heat_medium='water',
  description='Cook gently in liquid just below boiling.',
  completion_type='texture',completion_target='tender / reduced',completion_criterion='until tender / flavours melded',
  min_duration_seconds=300,max_duration_seconds=5400,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['saucepan'] where name='Simmer';
update tasks set is_verified=true,category='simmer',heat_mechanism='conduction',heat_medium='water',
  description='Cook gently submerged in barely-simmering liquid.',
  completion_type='texture',completion_target='just set / tender',completion_criterion='until just set / tender',
  min_duration_seconds=180,max_duration_seconds=1200,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['saucepan'] where name='Poach';
update tasks set is_verified=true,category='boil',heat_mechanism='conduction',heat_medium='water',
  description='Briefly boil then refresh in cold water.',
  completion_type='time',completion_target='30s-3min then ice bath',completion_criterion='brief, then ice bath',
  min_duration_seconds=30,max_duration_seconds=180,typical_input_state='raw',typical_output_state='blanched',
  suggested_tool_slugs=array['stock-pot'] where name='Blanch';
update tasks set is_verified=true,category='steam',heat_mechanism='convection',heat_medium='steam',
  description='Cook over boiling water using steam.',
  completion_type='texture',completion_target='tender',completion_criterion='until tender / cooked through',
  min_duration_seconds=300,max_duration_seconds=1800,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['saucepan','steamer-basket'] where name='Steam';

update tasks set is_verified=true,category='fry',heat_mechanism='conduction',heat_medium='fat',
  description='Cook in a little fat over moderate-high heat, moving the food.',
  completion_type='color',completion_target='softened / lightly golden',completion_criterion='until softened / translucent / lightly golden',
  min_duration_seconds=120,max_duration_seconds=600,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['frying-pan'] where name='Sauté';
update tasks set is_verified=true,category='fry',heat_mechanism='conduction',heat_medium='fat',
  description='Cook in a moderate amount of fat until cooked and browned.',
  completion_type='color',completion_target='golden / crispy',completion_criterion='until golden / crispy / cooked through',
  min_duration_seconds=180,max_duration_seconds=900,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['frying-pan'] where name='Pan-fry';
update tasks set is_verified=true,category='fry',heat_mechanism='conduction',heat_medium='fat',
  description='Cook over high heat to brown the surface quickly.',
  completion_type='color',completion_target='deep brown crust',completion_criterion='until a deep brown crust forms',
  min_duration_seconds=60,max_duration_seconds=300,typical_input_state='raw',typical_output_state='seared',
  suggested_tool_slugs=array['frying-pan','cast-iron-pan'] where name='Sear';
update tasks set is_verified=true,category='fry',heat_mechanism='conduction',heat_medium='fat',
  description='Cook quickly over very high heat, tossing constantly.',
  completion_type='texture',completion_target='crisp-tender',completion_criterion='until crisp-tender',
  min_duration_seconds=120,max_duration_seconds=480,typical_input_state='raw',typical_output_state='cooked',
  suggested_tool_slugs=array['wok'] where name='Stir-fry';
update tasks set is_verified=true,category='fry',heat_mechanism='conduction',heat_medium='fat',
  description='Cook gently in fat to melt/soften a solid (e.g. butter).',
  completion_type='structural',completion_target='fully melted',completion_criterion='until fully melted / liquid',
  min_duration_seconds=30,max_duration_seconds=300,typical_input_state='solid',typical_output_state='melted',
  suggested_tool_slugs=array['saucepan'] where name='melt';
update tasks set name='Melt' where name='melt';

update tasks set is_verified=true,category='oven',heat_mechanism='convection',heat_medium='air',
  description='Cook with dry heat in an oven.',
  completion_type='color',completion_target='set / golden',completion_criterion='until set / golden / a tester comes out clean',
  min_duration_seconds=600,max_duration_seconds=5400,typical_input_state='raw',typical_output_state='baked',
  suggested_tool_slugs=array['conventional-oven','roasting-tin'] where name='Bake';
update tasks set is_verified=true,category='oven',heat_mechanism='convection',heat_medium='air',
  description='Cook with dry oven heat, usually meat or vegetables.',
  completion_type='core_temp',completion_target='target internal temp',completion_criterion='until browned and cooked through (target internal temp)',
  min_duration_seconds=900,max_duration_seconds=10800,typical_input_state='raw',typical_output_state='roasted',
  suggested_tool_slugs=array['conventional-oven','roasting-tin'] where name='Roast';

update tasks set is_verified=true,category='finish',heat_mechanism='conduction',heat_medium='water',
  description='Simmer a liquid to concentrate flavour / thicken.',
  completion_type='volume',completion_target='reduced / thickened',completion_criterion='until reduced / coats the back of a spoon',
  min_duration_seconds=180,max_duration_seconds=1800,typical_input_state='liquid',typical_output_state='reduced',
  suggested_tool_slugs=array['saucepan'] where name='Reduce';

update tasks set is_verified=true,category='mix',heat_mechanism='none',heat_medium='none',
  description='Combine ingredients until evenly incorporated.',
  completion_type='structural',completion_target='evenly combined',completion_criterion='until evenly combined',
  typical_input_state='separate',typical_output_state='mixed',
  suggested_tool_slugs=array['mixing-bowl','spoon'] where name='Mix';
update tasks set is_verified=true,category='mix',heat_mechanism='none',heat_medium='none',
  description='Beat briskly to combine and incorporate air.',
  completion_type='texture',completion_target='smooth / soft peaks',completion_criterion='until smooth / combined / thickened',
  min_duration_seconds=30,max_duration_seconds=420,typical_input_state='separate',typical_output_state='whisked',
  suggested_tool_slugs=array['whisk','mixing-bowl'] where name='Whisk';
update tasks set is_verified=true,category='mix',heat_mechanism='none',heat_medium='none',
  description='Gently combine a light mixture into a heavier one.',
  completion_type='structural',completion_target='just combined, no streaks',completion_criterion='until just combined (no streaks)',
  typical_input_state='separate',typical_output_state='folded',
  suggested_tool_slugs=array['spatula','mixing-bowl'] where name='Fold';
update tasks set is_verified=true,category='mix',heat_mechanism='none',heat_medium='none',
  description='Turn food to coat it evenly.',
  completion_type='structural',completion_target='evenly coated',completion_criterion='until evenly coated',
  typical_input_state='separate',typical_output_state='coated',
  suggested_tool_slugs=array['tongs','mixing-bowl'] where name='Toss';
update tasks set is_verified=true,category='mix',heat_mechanism='none',heat_medium='none',
  description='Move a mixture continuously to combine or distribute heat.',
  completion_type='subjective',completion_target=null,completion_criterion=null,
  typical_input_state='mixed',typical_output_state='mixed',
  suggested_tool_slugs=array['spoon','spatula'] where name='Stir';

update tasks set is_verified=true,category='knife_cuts',heat_mechanism='none',heat_medium='none',
  description='Cut into rough, irregular pieces.',
  completion_type='structural',completion_target='cut to size',completion_criterion='until cut to the required size',
  typical_input_state='whole',typical_output_state='chopped',
  suggested_tool_slugs=array['chefs-knife','chopping-board'] where name='Chop';
update tasks set is_verified=true,category='knife_cuts',heat_mechanism='none',heat_medium='none',
  description='Cut into thin, even slices.',
  completion_type='structural',completion_target='sliced to thickness',completion_criterion='until sliced to the required thickness',
  typical_input_state='whole',typical_output_state='sliced',
  suggested_tool_slugs=array['chefs-knife','chopping-board'] where name='Slice';
update tasks set is_verified=true,category='knife_cuts',heat_mechanism='none',heat_medium='none',
  description='Cut into small, even cubes.',
  completion_type='structural',completion_target='evenly diced',completion_criterion='until evenly diced',
  typical_input_state='whole',typical_output_state='diced',
  suggested_tool_slugs=array['chefs-knife','chopping-board'] where name='Dice';
update tasks set is_verified=true,category='knife_cuts',heat_mechanism='none',heat_medium='none',
  description='Chop very finely.',
  completion_type='structural',completion_target='very fine',completion_criterion='until very finely chopped',
  typical_input_state='whole',typical_output_state='minced',
  suggested_tool_slugs=array['chefs-knife','chopping-board'] where name='Mince';
update tasks set is_verified=true,category='prepare',heat_mechanism='none',heat_medium='none',
  description='Reduce to shreds/fine pieces against a grater.',
  completion_type='structural',completion_target='fully grated',completion_criterion='until fully grated',
  typical_input_state='whole',typical_output_state='grated',
  suggested_tool_slugs=array['grater'] where name='Grate';

update tasks set is_verified=true,category='transfer',heat_mechanism='none',heat_medium='none',
  description='Separate solids from cooking liquid through a colander. Typically separates a solid from a liquid — the NODE names BOTH outputs (e.g. cooked pasta AND pasta water).',
  completion_type='structural',completion_target='liquid drained',completion_criterion='until liquid has fully drained',
  typical_input_state='cooked-in-liquid',typical_output_state='drained',
  suggested_tool_slugs=array['colander'] where name='Drain';
update tasks set is_verified=true,category='transfer',heat_mechanism='none',heat_medium='none',
  description='Set aside a portion for later use (e.g. pasta water).',
  completion_type='subjective',completion_target=null,completion_criterion=null,
  typical_input_state='any',typical_output_state='reserved',
  suggested_tool_slugs=array['ladle'] where name='reserve';
update tasks set name='Reserve' where name='reserve';
update tasks set is_verified=true,category='transfer',heat_mechanism='none',heat_medium='none',
  description='Move food from one vessel to another.',
  completion_type='subjective',completion_target=null,completion_criterion=null,
  typical_input_state='any',typical_output_state='any',
  suggested_tool_slugs=array['tongs','spatula'] where name='Transfer';
update tasks set is_verified=true,category='transfer',heat_mechanism='none',heat_medium='none',
  description='Introduce an ingredient into a vessel / mixture.',
  completion_type='subjective',completion_target=null,completion_criterion=null,
  typical_input_state='any',typical_output_state='any' where name='Add';

update tasks set is_verified=true,category='prepare',heat_mechanism='none',heat_medium='none',
  description='Break the shell of an egg to release its contents.',
  completion_type='subjective',completion_target=null,completion_criterion=null,
  typical_input_state='whole',typical_output_state='cracked' where name='crack';
update tasks set name='Crack' where name='crack';

update tasks set is_verified=true,category='finish',heat_mechanism='none',heat_medium='none',
  description='Add salt, pepper, or other seasoning to taste.',
  completion_type='subjective',completion_target='to taste',completion_criterion='to taste',
  typical_input_state='any',typical_output_state='seasoned' where name='Season';
update tasks set is_verified=true,category='finish',heat_mechanism='none',heat_medium='none',
  description='Arrange the finished food on a plate for serving.',
  completion_type='subjective',completion_target=null,completion_criterion=null,
  typical_input_state='cooked',typical_output_state='plated',
  suggested_tool_slugs=array['tongs','spoon'] where name='Plate';
update tasks set is_verified=true,category='passive',heat_mechanism='none',heat_medium='none',
  description='Leave cooked food to rest so juices redistribute.',
  completion_type='time',completion_target='stated rest time',completion_criterion='rest for the stated time',
  min_duration_seconds=120,max_duration_seconds=1800,is_passive=true,
  typical_input_state='cooked',typical_output_state='rested' where name='Rest';
update tasks set is_verified=true,category='passive',heat_mechanism='none',heat_medium='none',
  description='Cool / hold in the fridge.',
  completion_type='time',completion_target='until chilled / set',completion_criterion='until chilled / set',
  min_duration_seconds=600,max_duration_seconds=86400,is_passive=true,
  typical_input_state='any',typical_output_state='chilled' where name='Chill';
update tasks set is_verified=true,category='passive',heat_mechanism='none',heat_medium='none',
  description='Soak food in a seasoned liquid to flavour / tenderise.',
  completion_type='time',completion_target='stated marinate time',completion_criterion='marinate for the stated time',
  min_duration_seconds=900,max_duration_seconds=86400,is_passive=true,
  typical_input_state='raw',typical_output_state='marinated' where name='Marinate';

-- 3) VERIFY
-- select name,category,heat_mechanism,heat_medium,completion_type,completion_target,
--        min_duration_seconds,max_duration_seconds,typical_input_state,typical_output_state
--   from tasks where is_verified=true order by category,name;
