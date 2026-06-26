// src/app/api/admin/eval/multi-dish/route.ts
//
// HARNESS for the multi-dish decomposition eval set
// (eval/multi_dish_decomposition.eval.ts). Admin-only. Runs each case against the
// REAL /api/recipes/decompose endpoint (forwarding the caller's session cookie, the
// same way reimport-all self-calls), then runs that case's assertions on the
// returned DAG and reports pass/fail per behaviour (M/T/R/G).
//
// USAGE (logged in as admin, in the browser console):
//   fetch('/api/admin/eval/multi-dish').then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)))
//
// This does NOT write anything — it only calls decompose (an AI/read call) and
// checks output. Safe to run repeatedly. Use it to (1) get the BASELINE of how the
// current single-dish prompt does on multi-dish cases, then (2) re-run after each
// prompt change to watch the behaviours go green.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MULTI_DISH_EVAL_CASES, type Dag } from '@/eval/multi_dish_decomposition.eval';

export const maxDuration = 300; // several sequential AI calls

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';

  const report: any[] = [];
  const behaviourTally: Record<string, { pass: number; total: number }> = {
    M: { pass: 0, total: 0 }, T: { pass: 0, total: 0 },
    R: { pass: 0, total: 0 }, G: { pass: 0, total: 0 },
  };

  for (const c of MULTI_DISH_EVAL_CASES) {
    const caseResult: any = { case: c.name, decomposeOk: false, assertions: [] };

    // (case3) note its precondition for the reader — the harness does not seed.
    if ((c as any).existingDishSlug) {
      caseResult.precondition = `requires existing recipe slug '${(c as any).existingDishSlug}' present`;
    }

    let dag: Dag | null = null;
    try {
      const r = await fetch(`${origin}/api/recipes/decompose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ extraction: c.extraction }),
      });
      const text = await r.text();
      if (!r.ok) {
        caseResult.error = `decompose ${r.status}: ${text.slice(0, 300)}`;
        report.push(caseResult);
        // still tally the assertions as failed-to-run
        for (const a of c.assertions) {
          behaviourTally[a.behaviour].total++;
          caseResult.assertions.push({ name: a.name, behaviour: a.behaviour, pass: false, reason: 'decompose did not return a DAG' });
        }
        continue;
      }
      // decompose returns the DAG json (shape: { title, servings, nodes, ... })
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      dag = (parsed?.dag ?? parsed) as Dag;     // tolerate { dag } or bare dag
      caseResult.decomposeOk = !!dag?.nodes;
      caseResult.nodeCount = dag?.nodes?.length ?? 0;
    } catch (e: any) {
      caseResult.error = `fetch failed: ${e?.message ?? e}`;
    }

    for (const a of c.assertions) {
      behaviourTally[a.behaviour].total++;
      let pass = false; let reason: string | undefined;
      if (dag?.nodes) {
        try {
          const res = a.check(dag);
          pass = res === true;
          if (!pass) reason = typeof res === 'string' ? res : 'failed';
        } catch (e: any) {
          reason = `assertion threw: ${e?.message ?? e}`;
        }
      } else {
        reason = 'no DAG to check';
      }
      if (pass) behaviourTally[a.behaviour].pass++;
      caseResult.assertions.push({ name: a.name, behaviour: a.behaviour, pass, ...(reason ? { reason } : {}) });
    }

    report.push(caseResult);
  }

  const summary = Object.fromEntries(
    Object.entries(behaviourTally).map(([k, v]) => [k, `${v.pass}/${v.total}`]),
  );

  return NextResponse.json({
    summary,
    legend: { M: 'merge shared work', T: 'terminals per dish', R: 'reuse existing', G: 'guard against false merges/edges' },
    cases: report,
  });
}
