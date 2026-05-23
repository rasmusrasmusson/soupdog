'use client';
import { useAuth } from '@/lib/auth-context';
import { LoggedOutHome } from '@/components/home/LoggedOutHome';
import { LoggedInHome } from '@/components/home/LoggedInHome';

export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <LoggedInHome /> : <LoggedOutHome />;
}
