import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkoutSet } from '../types.ts';
import {
  findPRs,
  streakWeeks,
  levelFromXp,
  xpForLevel,
  weeklyMuscleSets,
  monthlyBest,
  chartKind,
  setLabel,
  toInfoMap,
} from './stats.ts';
import { weekStart } from './dates.ts';

let nextId = 1;
const set = (date: string, exercise: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: nextId++,
  date,
  exercise,
  weight,
  reps,
  rpe: null,
  extraReps: 0,
  notes: '',
  side: '',
  durationSec: null,
  ...extra,
});

const info = toInfoMap([
  { name: 'hip thrust', isUnilateral: false, muscleGroup: 'Glutes', isAssisted: false },
  { name: 'assisted pull up', isUnilateral: false, muscleGroup: 'Back', isAssisted: true },
  { name: 'plank', isUnilateral: false, muscleGroup: 'Core', isAssisted: false },
]);

test('first set is not a record; beating it is', () => {
  const a = set('2026-01-01', 'hip thrust', 60, 8);
  const b = set('2026-01-08', 'hip thrust', 60, 8); // equal: not a record
  const c = set('2026-01-15', 'hip thrust', 60, 10);
  const d = set('2026-01-22', 'hip thrust', 70, 6); // e1RM 84 vs 80: record
  assert.deepEqual([...findPRs([d, c, b, a], info)], [c.id, d.id]);
});

test('assisted exercises: less assistance is a record', () => {
  const a = set('2026-01-01', 'assisted pull up', 45, 8);
  const b = set('2026-01-08', 'assisted pull up', 40, 5);
  const c = set('2026-01-15', 'assisted pull up', 45, 12);
  assert.deepEqual([...findPRs([a, b, c], info)], [b.id]);
});

test('timed sets compare seconds; weighted beats bodyweight', () => {
  const a = set('2026-01-01', 'plank', 0, 0, { durationSec: 50 });
  const b = set('2026-01-02', 'plank', 0, 0, { durationSec: 77 });
  const c = set('2026-01-01', 'back extension', 0, 20);
  const d = set('2026-01-02', 'back extension', 5, 10);
  assert.deepEqual([...findPRs([a, b, c, d], info)].sort(), [b.id, d.id].sort());
});

test('streak counts consecutive weeks and survives an empty current week', () => {
  const dates = ['2026-11-03', '2026-11-10', '2026-11-12', '2026-11-17'];
  assert.equal(streakWeeks(dates, '2026-11-19'), 3); // this week has a workout
  assert.equal(streakWeeks(dates.slice(0, 3), '2026-11-19'), 2); // this week empty, still alive
  assert.equal(streakWeeks(['2026-10-01'], '2026-11-19'), 0);
});

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-11-16'), '2026-11-16'); // Monday
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday
});

test('levels: each one costs 100 XP more than the last', () => {
  assert.deepEqual([xpForLevel(1), xpForLevel(2), xpForLevel(3), xpForLevel(4)], [0, 100, 300, 600]);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(299).level, 2);
  const l = levelFromXp(350);
  assert.deepEqual([l.level, l.xpIntoLevel, l.xpForNext, l.title], [3, 50, 300, 'Pebble Goblin']);
});

test('weekly muscle sets use the exercise muscle group', () => {
  const sets = [
    set('2026-11-16', 'hip thrust', 80, 8),
    set('2026-11-18', 'hip thrust', 80, 8),
    set('2026-11-18', 'mystery move', 10, 10),
    set('2026-11-24', 'hip thrust', 80, 8), // next week
  ];
  assert.deepEqual([...weeklyMuscleSets(sets, info, '2026-11-16')], [['Glutes', 2], ['Unassigned', 1]]);
});

test('monthly best per chart kind', () => {
  const sets = [
    set('2026-01-03', 'x', 40, 8),
    set('2026-01-20', 'x', 45, 5),
    set('2026-02-02', 'x', 50, 3),
  ];
  assert.deepEqual(monthlyBest(sets, 'weight'), [{ label: '2026-01', value: 45 }, { label: '2026-02', value: 50 }]);
  assert.deepEqual(monthlyBest(sets, 'assistance'), [{ label: '2026-01', value: 40 }, { label: '2026-02', value: 50 }]);
  assert.equal(chartKind([set('2026-01-01', 'plank', 0, 0, { durationSec: 30 })], false), 'seconds');
  assert.equal(chartKind([set('2026-01-01', 'push up', 0, 12)], false), 'reps');
});

test('set labels', () => {
  assert.equal(setLabel(set('d', 'x', 90, 12)), '90×12');
  assert.equal(setLabel(set('d', 'x', 40, 5, { extraReps: 2 })), '40×5+2');
  assert.equal(setLabel(set('d', 'x', 6, 11, { side: 'R' }), true), 'R 11');
  assert.equal(setLabel(set('d', 'x', 0, 15)), '15');
  assert.equal(setLabel(set('d', 'x', 0, 0, { durationSec: 45 })), '45s');
  assert.equal(setLabel(set('d', 'x', 22.68, 9)), '22.7×9'); // 50 lbs, shown rounded
  assert.equal(setLabel(set('d', 'x', 27.5, 6)), '27.5×6');
});
