'use client';
import { useAuth } from '@/lib/auth-context';
import { LoggedOutHome } from './LoggedOutHome';
import { LoggedInHome } from './LoggedInHome';
import type { Recipe } from '@/types';

export function HomeClient({ recipes }: { recipes: Recipe[] }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user
    ? <LoggedInHome recipes={recipes} />
    : <LoggedOutHome recipes={recipes} />;
}
