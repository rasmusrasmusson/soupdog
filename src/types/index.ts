export type UnitSystem = 'si' | 'imperial' | 'us';
export type DifficultyLevel = 'trivial' | 'easy' | 'medium' | 'hard' | 'expert';
export type FoodState = 'frozen' | 'refrigerated' | 'room_temp' | 'hot' | 'thawed_partial';

export interface Measurement {
  value: number;
  unit: string;
  display?: string;
}

export interface Ingredient {
  id: string;
  slug: string;
  name: string;
  description?: string;
  nutrition?: NutritionData;
  allergens?: string[];
  substitutions?: IngredientSubstitution[];
  storageConditions?: StorageCondition[];
  linkedRecipes?: string[];
  linkedProducts?: string[];
  transformedFrom?: string;
  transformationRecipe?: string;
}

export interface IngredientSubstitution {
  ingredientId: string;
  ratio: number;
  notes?: string;
}

export interface StorageCondition {
  method: 'refrigerate' | 'freeze' | 'pantry' | 'cool_dark' | 'room_temp';
  durationDays?: number;
  notes?: string;
}

export interface Recipe {
  id: string;
  slug: string;
  version: number;
  parentVersionId?: string;
  canonicalId?: string;
  title: string;
  description?: string;
  cuisine?: string;
  tags?: string[];
  servings: number;
  difficulty: DifficultyLevel;
  totalTimeSeconds: number;
  activeTimeSeconds?: number;
  passiveTimeSeconds?: number;
  ingredients: RecipeIngredientRef[];
  steps: RecipeStep[];
  subRecipes?: SubRecipeRef[];
  equipment?: EquipmentRef[];
  nutrition?: NutritionData;
  requiredFoodState?: FoodState;
  yieldDescription?: string;
  ratings?: RatingSummary;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredientRef {
  ingredientId: string;
  ingredientSlug: string;
  name: string;
  quantity: Measurement;
  state?: FoodState;
  prep?: string;
  optional?: boolean;
}

export interface RecipeStep {
  id: string;
  order: number;
  type: 'human' | 'machine' | 'passive';
  group?: string;           // logical grouping label, e.g. "Marinade", "Char chicken"
  instruction: string;
  ingredients?: string[];   // ingredientIds used in this step
  tools?: string[];         // tool names used in this step
  durationSeconds?: number;
  temperature?: Measurement;
  notes?: string;
}

export interface SubRecipeRef {
  recipeId: string;
  recipeSlug: string;
  title: string;
  usedAsIngredient?: string;
  optional?: boolean;
}

export interface EquipmentRef {
  equipmentId: string;
  name: string;
  required: boolean;
  alternatives?: string[];
}

export interface Equipment {
  id: string;
  slug: string;
  name: string;
  category: 'oven' | 'knife' | 'pan' | 'scale' | 'mixer' | 'appliance' | 'other';
  description?: string;
  connected?: boolean;
  capabilities?: ApplianceCapability[];
  linkedRecipes?: string[];
}

export interface ApplianceCapability {
  type: 'convection' | 'steam' | 'induction' | 'sous_vide' | 'probe' | 'wifi';
  notes?: string;
}

export interface NutritionData {
  perServingGrams?: number;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrates?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  allergens?: string[];
}

export interface RatingSummary {
  average: number;
  count: number;
}

export interface Rating {
  id: string;
  recipeId: string;
  userId: string;
  score: number;
  skillLevel?: DifficultyLevel;
  appliance?: string;
  country?: string;
  notes?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  unitSystem: UnitSystem;
  language: string;
  skillLevel?: DifficultyLevel;
  allergies?: string[];
  dietaryRestrictions?: string[];
  preferredCuisines?: string[];
  household?: HouseholdMember[];
  registeredEquipment?: string[];
}

export interface HouseholdMember {
  id: string;
  name: string;
  age?: number;
  allergies?: string[];
  restrictions?: string[];
}

export type SearchResultType = 'recipe' | 'ingredient' | 'equipment' | 'technique';

export interface SearchResult {
  id: string;
  slug: string;
  type: SearchResultType;
  title: string;
  description?: string;
  tags?: string[];
}
