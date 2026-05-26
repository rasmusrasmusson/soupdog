// src/lib/recipe-timing.ts
// Critical-path time calculation for recipe execution.
// Handles parallel appliance/passive steps correctly.

import type { RecipeStep } from '@/types';

export interface TimingResult {
  /** Critical path total in seconds */
  totalSeconds: number;
  /** Wall-clock time per group label */
  groupSeconds: Record<string, number>;
  /** Naive sum of all step durations (before parallel savings) */
  naiveSumSeconds: number;
  /** How many seconds parallel execution saves vs naive sum */
  parallelSavingsSeconds: number;
  /** True if any step has a duration > 0 */
  hasDurations: boolean;
}

interface StepNode {
  id: string;
  group: string;
  durationSeconds: number;
  isAppliance: boolean;   // appliance or passive → non-blocking
  globalIndex: number;
}

/**
 * Determine if a step is non-blocking (appliance or passive process).
 * A step is non-blocking if:
 *  - It has appliance settings attached, OR
 *  - Its step type is 'machine' or 'passive'
 */
function isNonBlocking(step: RecipeStep): boolean {
  return (
    step.type === 'machine' ||
    step.type === 'passive' ||
    step.applianceSettings != null
  );
}

/**
 * Calculate the critical path time for a recipe's steps.
 *
 * Algorithm:
 * Walk steps in order, maintaining:
 *   - `humanClock`: cumulative time spent on blocking (human) steps
 *   - `appliancePool`: set of running appliances { endsAt: number }
 *
 * For each step:
 *   If blocking (human): advance humanClock by step duration.
 *     Any appliances that finish before humanClock are "absorbed" (free).
 *   If non-blocking (appliance/passive): start it at humanClock,
 *     record it finishing at humanClock + duration.
 *
 * At end, critical path = max(humanClock, max appliance end time).
 *
 * For per-group times: apply the same logic within each group,
 * but account for appliances that started in earlier groups.
 */
export function calculateRecipeTiming(steps: RecipeStep[]): TimingResult {
  const hasDurations = steps.some(s => (s.durationSeconds ?? 0) > 0);

  if (!hasDurations) {
    return {
      totalSeconds: 0,
      groupSeconds: {},
      naiveSumSeconds: 0,
      parallelSavingsSeconds: 0,
      hasDurations: false,
    };
  }

  // ── Build step nodes ─────────────────────────────────────────
  const nodes: StepNode[] = steps.map((s, i) => ({
    id:              s.id,
    group:           s.group ?? 'General',
    durationSeconds: s.durationSeconds ?? 0,
    isAppliance:     isNonBlocking(s),
    globalIndex:     i,
  }));

  const naiveSumSeconds = nodes.reduce((sum, n) => sum + n.durationSeconds, 0);

  // ── Critical path walk ───────────────────────────────────────
  // appliances: array of { endsAt } tracking parallel tracks
  const appliances: { endsAt: number }[] = [];
  let humanClock = 0;

  for (const node of nodes) {
    if (node.durationSeconds === 0) continue;

    if (node.isAppliance) {
      // Start this appliance now (human clock position)
      appliances.push({ endsAt: humanClock + node.durationSeconds });
    } else {
      // Human step — advance the clock
      humanClock += node.durationSeconds;
      // Absorb any appliances that have finished by now (they're free)
      // (we don't need to do anything, they're already in the pool)
    }
  }

  const maxApplianceEnd = appliances.length > 0
    ? Math.max(...appliances.map(a => a.endsAt))
    : 0;

  const totalSeconds = Math.max(humanClock, maxApplianceEnd);
  const parallelSavingsSeconds = naiveSumSeconds - totalSeconds;

  // ── Per-group times ──────────────────────────────────────────
  // For each group: same algorithm but scoped to just those steps.
  // We also need to account for appliances inherited from previous groups
  // (an oven started in group 1 is still running during group 2).
  const groupLabels = [...new Set(nodes.map(n => n.group))];
  const groupSeconds: Record<string, number> = {};

  // Track running appliances across groups (cumulative humanClock)
  const crossGroupAppliances: { endsAt: number }[] = [];
  let crossGroupHumanClock = 0;

  for (const label of groupLabels) {
    const groupNodes = nodes.filter(n => n.group === label);
    const groupStartClock = crossGroupHumanClock;

    for (const node of groupNodes) {
      if (node.durationSeconds === 0) continue;
      if (node.isAppliance) {
        crossGroupAppliances.push({ endsAt: crossGroupHumanClock + node.durationSeconds });
      } else {
        crossGroupHumanClock += node.durationSeconds;
      }
    }

    // Group wall-clock = how much the human clock advanced in this group
    // + any appliance that extends beyond human steps IN this group
    const groupHumanTime = crossGroupHumanClock - groupStartClock;

    // Appliances that started in this group
    const groupApplianceEnds = crossGroupAppliances
      .filter(a => a.endsAt > groupStartClock)
      .map(a => a.endsAt - groupStartClock);

    const groupApplianceMax = groupApplianceEnds.length > 0
      ? Math.max(...groupApplianceEnds)
      : 0;

    // Group time = max of human time and appliance time within group bounds
    // but capped so we don't double-count appliances that finish in a later group
    groupSeconds[label] = Math.max(groupHumanTime, Math.min(groupApplianceMax, groupHumanTime + 
      (nodes.filter(n => n.group === label && n.isAppliance)
        .reduce((max, n) => Math.max(max, n.durationSeconds), 0))
    ));
  }

  return {
    totalSeconds,
    groupSeconds,
    naiveSumSeconds,
    parallelSavingsSeconds: Math.max(0, parallelSavingsSeconds),
    hasDurations: true,
  };
}

/**
 * Calculate total seconds to write to the DB on save.
 * Same as calculateRecipeTiming but takes the flat editor step format.
 */
export function calculateTotalSecondsForSave(steps: {
  durationMinutes: number;
  stepType?: string;
  stepTools?: { applianceId?: string }[];
}[]): number {
  const appliances: { endsAt: number }[] = [];
  let humanClock = 0;

  for (const step of steps) {
    const dur = (step.durationMinutes ?? 0) * 60;
    if (dur === 0) continue;

    const isAppliance =
      step.stepType === 'machine' ||
      step.stepType === 'passive' ||
      (step.stepTools ?? []).some(t => t.applianceId);

    if (isAppliance) {
      appliances.push({ endsAt: humanClock + dur });
    } else {
      humanClock += dur;
    }
  }

  const maxApplianceEnd = appliances.length > 0
    ? Math.max(...appliances.map(a => a.endsAt))
    : 0;

  return Math.max(humanClock, maxApplianceEnd);
}
