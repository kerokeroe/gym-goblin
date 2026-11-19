import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickLog, matchExercise } from './quicklog.ts';

const known = ['hip thrust', 'single leg hip thrust', 'bulgarian split squat', 'assisted pull up', 'cable row', 'plank', 'push up', 'rdl'];

function ok(input: string) {
  const r = parseQuickLog(input, known);
  if (!r.ok) throw new Error(`${input}: ${r.error}`);
  return r.set;
}

test('weight and reps', () => {
  assert.deepEqual(
    { ...ok('hip thrust 90 11') },
    { exercise: 'hip thrust', weight: 90, reps: 11, extraReps: 0, rpe: null, side: '', durationSec: null, notes: '' }
  );
});

test('units, x and decimal commas', () => {
  assert.equal(ok('rdl 30kg x 8').weight, 30);
  assert.equal(ok('rdl 27,5 x6').weight, 27.5);
  assert.equal(ok('rdl 30x8').reps, 8);
});

test('rpe written two ways', () => {
  assert.equal(ok('rdl 30 8 rpe 8').rpe, 8);
  assert.equal(ok('rdl 30 8 @7.5').rpe, 7.5);
});

test('dumbbell pair is weight per hand', () => {
  const s = ok('bulgarian 6+6 9 L');
  assert.deepEqual([s.exercise, s.weight, s.reps, s.side, s.notes], ['bulgarian split squat', 6, 9, 'L', 'per hand']);
});

test('extra reps after the reps', () => {
  const s = ok('assisted 40 5+2');
  assert.deepEqual([s.exercise, s.weight, s.reps, s.extraReps], ['assisted pull up', 40, 5, 2]);
});

test('pounds are converted to kg and remembered in notes', () => {
  const s = ok('cable row 50 lbs 12');
  assert.equal(s.weight, 22.68);
  assert.equal(s.notes, '50 lbs');
});

test('timed sets', () => {
  assert.equal(ok('plank 45 sec').durationSec, 45);
  assert.equal(ok('plank 45s').durationSec, 45);
  assert.equal(ok('plank 1:30').durationSec, 90);
  assert.equal(ok('plank 1 min 17 sec').durationSec, 77);
  const weighted = ok('plank 10 kg 45 sec');
  assert.deepEqual([weighted.weight, weighted.durationSec, weighted.reps], [10, 45, 0]);
});

test('bodyweight reps', () => {
  const s = ok('push up 15');
  assert.deepEqual([s.weight, s.reps], [0, 15]);
});

test('unknown exercise is allowed and flagged', () => {
  const r = parseQuickLog('zercher squat 60 5', known);
  assert.ok(r.ok && r.isNewExercise && r.set.exercise === 'zercher squat');
});

test('helpful errors', () => {
  const err = (input: string) => {
    const r = parseQuickLog(input, known);
    return r.ok ? null : r.error;
  };
  assert.match(err('hip thrust') ?? '', /numbers/);
  assert.match(err('90 10') ?? '', /exercise name/);
  assert.match(err('rdl 30 8 9') ?? '', /one set/);
  assert.match(err('bulgarian 6+8 9') ?? '', /one hand/);
  assert.match(err('rdl 30 8 rpe 12') ?? '', /RPE/);
  assert.match(err('rdl 30 8.5') ?? '', /whole/);
  assert.match(err('rdl 30 eight') ?? '', /eight/);
});

test('exercise matching: exact beats prefix beats words', () => {
  assert.deepEqual(matchExercise('hip thrust', known), ['hip thrust']);
  assert.deepEqual(matchExercise('bulg', known), ['bulgarian split squat']);
  assert.deepEqual(matchExercise('leg thrust', known), ['single leg hip thrust']);
  assert.deepEqual(matchExercise('thrust', known).sort(), ['hip thrust', 'single leg hip thrust']);
});

test('ambiguous name keeps what was typed and lists candidates', () => {
  const r = parseQuickLog('thrust 80 8', known);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.set.exercise, 'thrust');
    assert.equal(r.candidates.length, 2);
  }
});
