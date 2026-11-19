import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSetLine, parseExtracted, assignSources } from '../scripts/import/extracted-format.js';

const dates = ['2025-03-01', '2025-03-01', '2025-03-04'];
const dateOf = (msg) => dates[msg];

test('parses a plain set line', () => {
  const s = parseSetLine('0|hip thrust|60|8');
  assert.equal(s.exercise, 'hip thrust');
  assert.equal(s.weight, 60);
  assert.equal(s.reps, 8);
  assert.equal(s.rpe, null);
  assert.equal(s.side, '');
});

test('parses every option', () => {
  const s = parseSetLine('1|bulgarian split squat|7.5|9|L|p8.5|+2|n3|d2025-03-02|#per hand');
  assert.deepEqual(
    { side: s.side, rpe: s.rpe, extraReps: s.extraReps, count: s.count, date: s.date, notes: s.notes },
    { side: 'L', rpe: 8.5, extraReps: 2, count: 3, date: '2025-03-02', notes: 'per hand' }
  );
});

test('timed sets need a duration when reps is 0', () => {
  assert.equal(parseSetLine('0|plank|0|0|t75').durationSec, 75);
  assert.throws(() => parseSetLine('0|plank|0|0'), /reps or a duration/);
});

test('rejects bad input instead of guessing', () => {
  assert.throws(() => parseSetLine('x|rdl|30|8'), /message index/);
  assert.throws(() => parseSetLine('0|RDL|30|8'), /lowercase/);
  assert.throws(() => parseSetLine('0|rdl|-5|8'), /weight/);
  assert.throws(() => parseSetLine('0|rdl|30|8.5'), /reps/);
  assert.throws(() => parseSetLine('0|rdl|30|8|p11'), /rpe/);
  assert.throws(() => parseSetLine('0|rdl|30|8|zz'), /unknown option/);
});

test('expands nK into K sets and dates them from the message', () => {
  const { sets } = parseExtracted('2|leg press|50|8|n3', dateOf);
  assert.equal(sets.length, 3);
  assert.ok(sets.every((s) => s.date === '2025-03-04' && s.msg === 2));
});

test('review lines: "skip" imports nothing, a set default is imported', () => {
  const text = [
    '# a comment',
    '?0|no exercise name|skip',
    '?1|which weight?|1|glute kickbacks|7.5|15|R',
    '',
  ].join('\n');
  const { sets, reviews } = parseExtracted(text, dateOf);
  assert.equal(reviews.length, 2);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].exercise, 'glute kickbacks');
});

test('errors point at the file and line', () => {
  assert.throws(() => parseExtracted('0|rdl|30|8\n0|rdl|oops|8', dateOf, '003.txt'), /003\.txt:2: bad weight/);
});

test('a message index without a date is an error', () => {
  assert.throws(() => parseExtracted('9|rdl|30|8', dateOf), /no date for message 9/);
});

test('source ids are stable and unique per message', () => {
  const { sets } = parseExtracted('0|rdl|30|8|n2\n1|rdl|30|9\n0|rdl|35|6', dateOf);
  assert.deepEqual(
    assignSources(sets).map((s) => s.source),
    ['tg:0:0', 'tg:0:1', 'tg:1:0', 'tg:0:2']
  );
});
