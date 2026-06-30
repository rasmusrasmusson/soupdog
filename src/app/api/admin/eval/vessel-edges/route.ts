// src/app/api/admin/eval/vessel-edges/route.ts
//
// HARNESS for the vessel-edges & reading-order eval set
// (eval/vessel_edges_reading_order.eval.ts). Admin-only. Runs each case against the
// REAL /api/recipes/decompose endpoint (forwarding the caller's session cookie),
// then runs that case's assertions on the returned DAG and reports pass/fail per
// behaviour (O/E/C).
//
// USAGE (logged in as admin, in the browser console):
//   fetch('/api/admin/eval/vessel-edges').then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)))
//
// Read-only: it only calls decompose (an AI/read call) and checks output. Safe to
// run repeatedly. Use it to confirm the salad reads cut-one-add-one with no false
// add→add edges, and the béchamel keeps its roux chain — and to catch regressions
// after any future decompose-prompt change.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { vesselEdgesCases } from '@/eval/vessel_edges_reading_order.eval';
import type { Dag } from '@/eval/multi_dish_decomposition.eval';
import { toposortNodes } from '@/lib/recipes/toposort-nodes';

export const maxDuration = 300; // sequential AI calls

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
    O: { pass: 0, total: 0 }, E: { pass: 0, total: 0 }, C: { pass: 0, total: 0 },
  };

  for (const c of vesselEdgesCases) {
    const caseResult: any = { case: c.name, decomposeOk: false, assertions: [] };

    let dag: Dag | null = null;
    try {
      const t0 = Date.now();
      const r = await fetch(`${origin}/api/recipes/decompose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ extraction: c.extraction }),
      });
      const text = await r.text();
      caseResult.decomposeMs = Date.now() - t0;   // latency — the half of the A/B that the eval doesn't otherwise capture
      if (!r.ok) {
        caseResult.error = `decompose ${r.status}: ${text.slice(0, 300)}`;
        for (const a of c.assertions) {
          behaviourTally[a.behaviour].total++;
          caseResult.assertions.push({ name: a.name, behaviour: a.behaviour, pass: false, reason: 'decompose did not return a DAG' });
        }
        report.push(caseResult);
        continue;
      }
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      dag = (parsed?.dag ?? parsed) as Dag;     // tolerate { dag } or bare dag
      // Apply the same topological sort decompose-SAVE applies, so the assertions
      // test the TRUE shipped pipeline order (decompose → toposort), not the raw
      // model emission. The honest-edges/cut-one-add-one behaviour comes from the
      // prompt (already in this DAG); the "no consumer before producer" guarantee
      // comes from this sort at save — so reproduce it here before asserting.
      if (dag?.nodes) {
        dag = { ...dag, nodes: toposortNodes(dag.nodes as any) as any };
      }
      caseResult.decomposeOk = !!dag?.nodes;
      caseResult.nodeCount = dag?.nodes?.length ?? 0;
      // include the emitted reading order — handy when an assertion fails
      caseResult.readingOrder = (dag?.nodes ?? []).map((n: any, i: number) =>
        `${i + 1}. ${n.task}${(n.ingredients?.[0]?.name) ? ' ' + n.ingredients[0].name : ''}`);
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

  // Self-document which model produced these results (reads the same env the decompose
  // route reads), and the total decompose time across cases — so a Sonnet run and a
  // Haiku run are distinguishable + comparable after the fact.
  const modelUnderTest = process.env.DECOMPOSE_MODEL || 'claude-sonnet-4-6';
  const totalDecomposeMs = report.reduce((acc: number, c: any) => acc + (c.decomposeMs ?? 0), 0);

  return NextResponse.json({
    modelUnderTest,
    totalDecomposeMs,
    summary,
    legend: {
      O: 'order — independent adds unchained / dependent chain kept',
      E: 'emission/reading — cut-one-add-one, no consumer before producer',
      C: 'convergence — final combine fans in from all inputs',
    },
    cases: report,
  });
}
