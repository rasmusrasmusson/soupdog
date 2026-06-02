'use client';

// src/app/plan/page.tsx — thin wrapper. The menu lives in PlanView so it can be
// reused on the logged-in home.
import { PlanView } from '@/components/plan/PlanView';

export default function PlanPage() {
  return <PlanView />;
}
