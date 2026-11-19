// Pure functions behind the game layer: personal records, streaks, XP and levels,
// weekly muscle volume and chart data. No React, no fetch: easy to test.
import type { ExerciseInfo, WorkoutSet } from '../types.ts';
import { weekStart, addDays } from './dates.ts';

/** Estimated one-rep max (Epley). */
export const e1rm = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));

export type InfoMap = Map<string, ExerciseInfo>;
export const toInfoMap = (list: ExerciseInfo[]): InfoMap => new Map(list.map((e) => [e.name, e]));

/**
 * One number per set, where higher always means "better", so records are a
 * simple max. Timed sets compare seconds; assisted exercises reward LESS
 * assistance (then more reps); weighted sets use e1RM and always beat
 * bodyweight sets of the same exercise.
 */
export function setScore(set: WorkoutSet, assisted: boolean): number {
  if (set.durationSec) return set.durationSec;
  if (assisted) return -set.weight * 1000 + set.reps;
  if (set.weight > 0) return 1000 + e1rm(set.weight, set.reps);
  return set.reps;
}

const chronological = (a: WorkoutSet, b: WorkoutSet) => a.date.localeCompare(b.date) || a.id - b.id;

/**
 * Ids of sets that beat every earlier set of the same exercise. The very first
 * set of an exercise sets the bar; it is not a record.
 */
export function findPRs(sets: WorkoutSet[], info: InfoMap): Set<number> {
  const best = new Map<string, number>();
  const prs = new Set<number>();
  for (const s of [...sets].sort(chronological)) {
    const score = setScore(s, info.get(s.exercise)?.isAssisted ?? false);
    const prev = best.get(s.exercise);
    if (prev === undefined || score > prev) {
      if (prev !== undefined) prs.add(s.id);
      best.set(s.exercise, score);
    }
  }
  return prs;
}

/**
 * Consecutive weeks (Mon-Sun) with at least one workout, counting back from
 * this week. An empty current week doesn't break the streak until it ends.
 */
export function streakWeeks(dates: string[], todayIso: string): number {
  const weeks = new Set(dates.map(weekStart));
  let week = weekStart(todayIso);
  if (!weeks.has(week)) week = addDays(week, -7);
  let streak = 0;
  while (weeks.has(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

export const XP_PER_SET = 10;
export const XP_PER_PR = 50;

const TITLES = ['Pebble', 'Mud', 'Swamp', 'Cave', 'Iron', 'Gains', 'Chief', 'Legend'];

/** Total XP needed to reach `level` (level 1 needs 0). Each level costs 100 more than the last. */
export const xpForLevel = (level: number) => 50 * (level - 1) * level;

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: `${TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 4))]} Goblin`,
    xpIntoLevel: xp - start,
    xpForNext: next - start,
  };
}

export function xpTotal(setCount: number, prCount: number) {
  return setCount * XP_PER_SET + prCount * XP_PER_PR;
}

/** Sets per muscle group in the week starting at `monday`. */
export function weeklyMuscleSets(sets: WorkoutSet[], info: InfoMap, monday: string): Map<string, number> {
  const sunday = addDays(monday, 6);
  const counts = new Map<string, number>();
  for (const s of sets) {
    if (s.date < monday || s.date > sunday) continue;
    const group = info.get(s.exercise)?.muscleGroup || 'Unassigned';
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

export type ChartPoint = { label: string; value: number };
export type ChartKind = 'weight' | 'assistance' | 'reps' | 'seconds';

/** What the exercise chart should plot: the main number people track for it. */
export function chartKind(sets: WorkoutSet[], assisted: boolean): ChartKind {
  if (sets.some((s) => s.durationSec)) return 'seconds';
  if (assisted) return 'assistance';
  if (sets.some((s) => s.weight > 0)) return 'weight';
  return 'reps';
}

/** The best value per month, oldest first. Assistance: the lowest is best. */
export function monthlyBest(sets: WorkoutSet[], kind: ChartKind): ChartPoint[] {
  const byMonth = new Map<string, number>();
  for (const s of sets) {
    const value = kind === 'seconds' ? s.durationSec ?? 0 : kind === 'reps' ? s.reps : s.weight;
    if (kind === 'weight' && s.weight === 0) continue;
    const month = s.date.slice(0, 7);
    const prev = byMonth.get(month);
    const better = kind === 'assistance' ? prev === undefined || value < prev : prev === undefined || value > prev;
    if (better) byMonth.set(month, value);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Weight for display: at most one decimal (22.68 kg from 50 lbs shows as 22.7). */
export const kg = (w: number) => String(Math.round(w * 10) / 10);

/** Short label for a set: "90×12", "R 11", "45s", "15", "+2" extras. */
export function setLabel(s: WorkoutSet, unilateral = false): string {
  const extra = s.extraReps ? `+${s.extraReps}` : '';
  const side = s.side ? `${s.side} ` : '';
  if (s.durationSec) return `${side}${s.weight ? `${kg(s.weight)}kg ` : ''}${s.durationSec}s`;
  if (unilateral && s.side) return `${side}${s.reps}${extra}`;
  return `${side}${s.weight ? `${kg(s.weight)}×` : ''}${s.reps}${extra}`;
}
