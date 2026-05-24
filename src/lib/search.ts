import type { Recipe } from '@/types';

export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();

  return recipes.filter(recipe =>
    recipe.title.toLowerCase().includes(q) ||
    recipe.description?.toLowerCase().includes(q) ||
    recipe.cuisine?.toLowerCase().includes(q) ||
    recipe.tags?.some(tag => tag.toLowerCase().includes(q)) ||
    recipe.ingredients.some(ing => ing.name.toLowerCase().includes(q))
  );
}
