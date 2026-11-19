import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, migrate, run, all, close } from '../server/db.js';
import { importSets } from '../scripts/import/import-telegram.js';
import { parseExtracted, assignSources } from '../scripts/import/extracted-format.js';

const dates = ['2025-09-01', '2025-09-01', '2025-09-03'];
const extracted = assignSources(
  parseExtracted(['0|hip thrust|80|8|n2', '1|plank|0|0|t60', '2|rdl|30|10'].join('\n'), (m) => dates[m]).sets
);

async function freshDb() {
  const db = await open(':memory:');
  await migrate(db);
  return db;
}

test('imports every set with its source id', async () => {
  const db = await freshDb();
  const report = await importSets(db, extracted);
  assert.equal(report.inserted, 4);
  assert.equal(report.days, 2);
  const rows = await all(db, 'SELECT date, exercise, reps, durationSec, source FROM workouts ORDER BY id');
  assert.deepEqual(rows.map((r) => r.source), ['tg:0:0', 'tg:0:1', 'tg:1:0', 'tg:2:0']);
  assert.equal(rows[2].durationSec, 60);
  await close(db);
});

test('re-running the import inserts nothing new', async () => {
  const db = await freshDb();
  await importSets(db, extracted);
  const again = await importSets(db, extracted);
  assert.equal(again.inserted, 0);
  assert.equal(again.alreadyImported, 4);
  assert.equal((await all(db, 'SELECT id FROM workouts')).length, 4);
  await close(db);
});

test('days that were typed by hand are left alone', async () => {
  const db = await freshDb();
  await run(db, `INSERT INTO workouts (date, exercise, reps, weight, rpe, createdAt) VALUES ('2025-09-01', 'hip thrust', 8, 80, 8, 'now')`);
  const report = await importSets(db, extracted);
  assert.deepEqual(report.skippedDays, ['2025-09-01']);
  assert.equal(report.inserted, 1); // only the rdl on 09-03
  await close(db);
});

test('misspelled exercise names are renamed, keeping their settings', async () => {
  const db = await freshDb();
  await run(db, `INSERT INTO exercises (name, createdAt, isUnilateral, muscleGroup) VALUES ('bulfarian split squat', 'now', 1, 'Quads')`);
  await run(db, `INSERT INTO workouts (date, exercise, reps, weight, rpe, createdAt) VALUES ('2026-06-01', 'bulfarian split squat', 8, 6, 8, 'now')`);
  await importSets(db, []);
  assert.deepEqual(await all(db, 'SELECT exercise FROM workouts'), [{ exercise: 'bulgarian split squat' }]);
  const [ex] = await all(db, "SELECT * FROM exercises WHERE name = 'bulgarian split squat'");
  assert.equal(ex.isUnilateral, 1);
  assert.equal((await all(db, "SELECT * FROM exercises WHERE name = 'bulfarian split squat'")).length, 0);
  await close(db);
});

test('new exercises get metadata from the table', async () => {
  const db = await freshDb();
  const report = await importSets(db, extracted);
  assert.deepEqual(report.newExercises, ['hip thrust', 'plank', 'rdl']);
  const rows = await all(db, 'SELECT name, muscleGroup FROM exercises ORDER BY name');
  assert.deepEqual(rows.map((r) => r.muscleGroup), ['Glutes', 'Core', 'Hamstrings']);
  await close(db);
});
