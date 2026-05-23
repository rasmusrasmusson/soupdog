import { getRecipes } from '@/lib/recipes';
import { sampleRecipes } from '@/data/sample-recipes';
import { HomeClient } from '@/components/home/HomeClient';
import type { Recipe } from '@/types';

export default async function Home() {
  let recipes: Recipe[] = [];
  try {
    recipes = await getRecipes();
  } catch {}
  if (!recipes.length) recipes = sampleRecipes;
  return <HomeClient recipes={recipes} />;
}
