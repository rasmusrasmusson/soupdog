// ═══════════════════════════════════════════════════════════════
//  Soupdog — TypeScript Types v2
// ═══════════════════════════════════════════════════════════════

export type UnitSystem      = 'si' | 'imperial' | 'us';
export type DifficultyLevel = 'trivial' | 'easy' | 'medium' | 'hard' | 'expert';
export type FoodState       = 'frozen' | 'refrigerated' | 'room_temp' | 'hot' | 'thawed_partial' | 'dried' | 'fermented' | 'cured';
export type StepType        = 'human' | 'machine' | 'passive';
export type RecipeSource    = 'human_authored' | 'ai_known_dish' | 'ai_generated' | 'imported';
export type InventoryState  = 'in_stock' | 'low' | 'out_of_stock' | 'expired';
export type IngredientCategory = 'vegetable' | 'fruit' | 'meat' | 'fish' | 'dairy' | 'grain' | 'spice' | 'herb' | 'oil' | 'liquid' | 'condiment' | 'prepared' | 'other';
export type EquipmentCategory  = 'oven' | 'knife' | 'pan' | 'scale' | 'mixer' | 'appliance' | 'thermometer' | 'other';
export type NutritionSource    = 'usda' | 'calculated' | 'lab_tested' | 'manufacturer';

// ── Measurement ───────────────────────────────────────────────
export interface Measurement {
  value: number;
  unit: string;
  display?: string;
}

// ── Nutrition ─────────────────────────────────────────────────
// Stored per 100g on ingredients/products; per serving on recipes
export interface NutritionData {
  calories?:      number;
  protein?:       number;   // g
  fat?:           number;   // g
  carbohydrates?: number;   // g
  fiber?:         number;   // g
  sugar?:         number;   // g
  sodium?:        number;   // mg
  saturatedFat?:  number;   // g
  // Micronutrients (Phase 2+)
  vitaminC?:      number;   // mg
  iron?:          number;   // mg
  calcium?:       number;   // mg
  // Meta
  perServingGrams?: number;
  allergens?:       string[];
}

// ═══════════════════════════════════════════════════════════════
//  INGREDIENT
// ═══════════════════════════════════════════════════════════════

export interface Ingredient {
  id:                     string;
  slug:                   string;
  name:                   string;
  description?:           string;
  category:               IngredientCategory;

  // Taxonomy
  transformedFromId?:     string;    // parent ingredient in transformation chain
  transformationRecipeId?: string;   // recipe that produces this from parent

  // Nutrition (per 100g)
  nutritionPer100g?:      NutritionData;
  nutritionSource?:       NutritionSource;

  allergens?:             string[];
  season?:                string[];  // months in season
  storageNotes?:          string;
  typicalUnit?:           string;
  isVerified:             boolean;
}

export interface IngredientSubstitution {
  ingredientId: string;
  ratio:        number;
  notes?:       string;
}

// ═══════════════════════════════════════════════════════════════
//  EQUIPMENT
// ═══════════════════════════════════════════════════════════════

export interface Equipment {
  id:           string;
  slug:         string;
  name:         string;
  category:     EquipmentCategory;
  description?: string;
  brand?:       string;
  modelNumber?: string;
  connected:    boolean;
  capabilities?: ApplianceCapability[];
}

export interface ApplianceCapability {
  type:   'convection' | 'steam' | 'induction' | 'sous_vide' | 'probe' | 'wifi';
  notes?: string;
}

// Per-user calibrated appliance profile
export interface ApplianceProfile {
  id:                       string;
  userId:                   string;
  equipmentId:              string;
  nickname?:                string;
  heatupSpeedCelsiusPerMin?: number;
  thermalPrecisionCelsius?:  number;
  humidityPrecisionPct?:     number;
  cavityVolumeLitres?:       number;
  thermalOvershootCelsius?:  number;
  notes?:                    string;
  calibratedAt?:             string;
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTS (packaged / prepared foods)
// ═══════════════════════════════════════════════════════════════

export interface Product {
  id:               string;
  slug:             string;
  name:             string;
  brand?:           string;
  barcode?:         string;
  description?:     string;
  ingredientList?:  string;
  allergens?:       string[];
  additives?:       string[];
  nutritionPer100g?: NutritionData;
  servingSizeG?:    number;
  openfoodfactsId?: string;
  dataSource?:      string;
  isVerified:       boolean;
  cookingProfiles?: ProductCookingProfile[];
}

export interface ProductCookingProfile {
  id:                  string;
  productId:           string;
  applianceProfileId?: string;
  equipmentId?:        string;
  foodState:           FoodState;
  initialTempCelsius?: number;
  method:              string;
  temperatureCelsius?: number;
  durationSeconds?:    number;
  powerWatts?:         number;
  notes?:              string;
  outcomeRating?:      number;
  outcomeNotes?:       string;
  source:              string;
  isVerified:          boolean;
}

// ═══════════════════════════════════════════════════════════════
//  RECIPE IDENTITY LAYER
// ═══════════════════════════════════════════════════════════════

// Stable identity anchor — never changes
export interface RecipeCanonical {
  id:               string;
  slug:             string;
  currentVersionId: string;
  authorId?:        string;
  isPublished:      boolean;
  source:           RecipeSource;
  confidenceScore?: number;
  createdAt:        string;
  // Resolved fields
  currentVersion?:  RecipeVersion;
  preferenceAxes?:  PreferenceAxis[];
}

// Versioned recipe content — immutable once published
export interface RecipeVersion {
  id:                  string;
  canonicalId:         string;
  parentVersionId?:    string;
  versionNumber:       number;
  changeSummary?:      string;

  title:               string;
  description?:        string;
  cuisine?:            string;
  tags?:               string[];
  baseServings:        number;
  difficulty:          DifficultyLevel;
  totalTimeSeconds:    number;
  activeTimeSeconds?:  number;
  passiveTimeSeconds?: number;
  yieldDescription?:   string;
  requiredFoodState?:  FoodState;
  nutritionPerServing?: NutritionData;
  isCanonicalVersion:  boolean;
  createdAt:           string;

  // Resolved associations
  ingredients?:        VersionIngredient[];
  steps?:              VersionStep[];
  equipment?:          VersionEquipment[];
  subRecipes?:         VersionSubRecipe[];
  translations?:       RecipeTranslation[];
}

export interface VersionIngredient {
  id:           string;
  versionId:    string;
  ingredientId: string;
  ingredient?:  Ingredient;    // resolved
  quantityValue: number;
  quantityUnit:  string;
  foodState?:    FoodState;
  prepNote?:     string;
  optional:      boolean;
  orderIndex:    number;
}

export interface VersionStep {
  id:                  string;
  versionId:           string;
  orderIndex:          number;
  stepType:            StepType;
  instruction:         string;
  durationSeconds?:    number;
  temperatureCelsius?: number;
  notes?:              string;
  groupLabel?:         string;
  isParallelPrev:      boolean;
  parallelGroupId?:    string;
  // Resolved
  ingredientRefs?:     string[];  // ingredient IDs used in this step
  equipmentRefs?:      string[];  // equipment IDs
}

export interface VersionEquipment {
  versionId:    string;
  equipmentId:  string;
  equipment?:   Equipment;   // resolved
  required:     boolean;
  alternatives?: string[];
}

export interface VersionSubRecipe {
  parentVersionId:        string;
  childCanonicalId:       string;
  childVersionId?:        string;
  usedAsIngredientLabel?: string;
  expandByDefault:        boolean;
  optional:               boolean;
  // Resolved
  childCanonical?:        RecipeCanonical;
}

export interface RecipeTranslation {
  id:               string;
  versionId:        string;
  locale:           string;
  title:            string;
  description?:     string;
  stepInstructions?: Record<number, string>;  // orderIndex → translated text
  translatedBy:     string;
  createdAt:        string;
}

// ═══════════════════════════════════════════════════════════════
//  EXECUTION VARIANTS
// ═══════════════════════════════════════════════════════════════

export interface ExecutionVariant {
  id:                    string;
  versionId:             string;
  derivedFromVariantId?: string;
  servings:              number;
  unitSystem:            UnitSystem;
  applianceProfileId?:   string;
  foodStateNotes?:       string;
  environmentNotes?:     string;
  isCanonicalVariant:    boolean;
  isUserFork:            boolean;
  authorId?:             string;
  nutritionPerServing?:  NutritionData;
  createdAt:             string;
  // Resolved
  ingredientScaling?:    VariantIngredientScaling[];
  stepOverrides?:        VariantStepOverride[];
  preferenceValues?:     VariantPreferenceMapping[];
}

export interface VariantIngredientScaling {
  id:                   string;
  variantId:            string;
  versionIngredientId:  string;
  quantityValueScaled:  number;
  quantityUnitScaled:   string;
  actualFoodState?:     FoodState;
  prepNoteOverride?:    string;
  aiScalingNote?:       string;
}

export interface VariantStepOverride {
  id:                          string;
  variantId:                   string;
  versionStepId:               string;
  durationSecondsOverride?:    number;
  temperatureCelsiusOverride?: number;
  instructionOverride?:        string;
  applianceSettings?:          Record<string, unknown>;
  overrideReason?:             string;
}

export interface PreferenceAxis {
  id:           string;
  canonicalId:  string;
  name:         string;
  displayLabel: string;
  values:       string[];
  defaultValue: string;
}

export interface VariantPreferenceMapping {
  variantId:        string;
  preferenceAxisId: string;
  preferenceValue:  string;
}

// ═══════════════════════════════════════════════════════════════
//  LEGACY RECIPE TYPE
//  Kept for compatibility with existing recipe page rendering.
//  New code should use RecipeVersion / ExecutionVariant.
// ═══════════════════════════════════════════════════════════════

export interface Recipe {
  id:                  string;
  slug:                string;
  version:             number;
  parentVersionId?:    string;
  canonicalId?:        string;
  // Version IDs for new-schema linking
  recipeVersionId?:    string;
  title:               string;
  description?:        string;
  cuisine?:            string;
  tags?:               string[];
  servings:            number;
  difficulty:          DifficultyLevel;
  totalTimeSeconds:    number;
  activeTimeSeconds?:  number;
  passiveTimeSeconds?: number;
  ingredients:         RecipeIngredientRef[];
  steps:               RecipeStep[];
  subRecipes?:         SubRecipeRef[];
  equipment?:          EquipmentRef[];
  nutrition?:          NutritionData;
  requiredFoodState?:  FoodState;
  yieldDescription?:   string;
  ratings?:            RatingSummary;
  createdAt:           string;
  updatedAt:           string;
}

export interface RecipeIngredientRef {
  ingredientId:   string;
  ingredientSlug: string;
  name:           string;
  quantity:       Measurement;
  state?:         FoodState;
  prep?:          string;
  optional?:      boolean;
  // Extended fields
  nutritionPer100g?: NutritionData;
}

export interface RecipeStep {
  id:               string;
  order:            number;
  type:             StepType;
  group?:           string;
  instruction:      string;
  ingredients?:     string[];  // ingredientIds
  tools?:           string[];  // tool names
  durationSeconds?: number;
  temperature?:     Measurement;
  notes?:           string;
}

export interface SubRecipeRef {
  recipeId:          string;
  recipeSlug:        string;
  title:             string;
  usedAsIngredient?: string;
  optional?:         boolean;
}

export interface EquipmentRef {
  equipmentId:   string;
  name:          string;
  required:      boolean;
  alternatives?: string[];
}

export interface RatingSummary {
  average: number;
  count:   number;
}

export interface Rating {
  id:                  string;
  canonicalId:         string;
  versionId?:          string;
  variantId?:          string;
  userId:              string;
  score:               number;
  skillLevel?:         DifficultyLevel;
  applianceProfileId?: string;
  country?:            string;
  notes?:              string;
  createdAt:           string;
}

// ═══════════════════════════════════════════════════════════════
//  USER DATA
// ═══════════════════════════════════════════════════════════════

export interface UserProfile {
  id:                   string;
  email:                string;
  displayName?:         string;
  unitSystem:           UnitSystem;
  language:             string;
  skillLevel?:          DifficultyLevel;
  allergies?:           string[];
  dietaryRestrictions?: string[];
  preferredCuisines?:   string[];
  household?:           HouseholdMember[];
  registeredEquipment?: string[];
}

export interface HouseholdMember {
  id:           string;
  userId:       string;
  name:         string;
  age?:         number;
  allergies?:   string[];
  restrictions?: string[];
}

export interface NutritionProfile {
  id:                   string;
  userId:               string;
  householdMemberId?:   string;
  label?:               string;
  // Goals
  dailyCaloriesKcal?:   number;
  dailyProteinG?:       number;
  dailyCarbsG?:         number;
  dailyFatG?:           number;
  dailyFiberG?:         number;
  dailySodiumMg?:       number;
  // Restrictions
  allergies?:           string[];
  dietaryRestrictions?: string[];
  medicalConditions?:   string[];
  // Demographics
  ageYears?:            number;
  biologicalSex?:       string;
  weightKg?:            number;
  heightCm?:            number;
  activityLevel?:       'sedentary' | 'moderate' | 'active' | 'very_active';
}

export interface FlavorPreferences {
  id:                   string;
  userId:               string;
  likedCuisines?:       string[];
  dislikedCuisines?:    string[];
  likedIngredients?:    string[];
  dislikedIngredients?: string[];
  spiceTolerance?:      number;   // 0.0–1.0
  sweetPreference?:     number;
  sourPreference?:      number;
  umamiPreference?:     number;
  bitterTolerance?:     number;
  likedTextures?:       string[];
  dislikedTextures?:    string[];
  notes?:               string;
}

export interface InventoryItem {
  id:             string;
  userId:         string;
  ingredientId?:  string;
  productId?:     string;
  customName?:    string;
  quantityValue?: number;
  quantityUnit?:  string;
  foodState?:     FoodState;
  expiryDate?:    string;
  openedAt?:      string;
  location?:      'fridge' | 'freezer' | 'pantry' | string;
  invState:       InventoryState;
  notes?:         string;
  addedAt:        string;
  // Resolved
  ingredient?:    Ingredient;
  product?:       Product;
}

// ═══════════════════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════════════════

export type SearchResultType = 'recipe' | 'ingredient' | 'equipment' | 'product' | 'technique';

export interface SearchResult {
  id:           string;
  slug:         string;
  type:         SearchResultType;
  title:        string;
  description?: string;
  tags?:        string[];
}
