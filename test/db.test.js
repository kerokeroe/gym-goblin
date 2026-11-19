import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, migrate, exec, all, get, run, close, SCHEMA_VERSION } from '../server/db.js';

// The schema as it existed before versioning: rpe NOT NULL, side added later.
const LEGACY = `
  CREATE TABLE workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, exercise TEXT NOT NULL,
    reps INTEGER NOT NULL, weight REAL NOT NULL, rpe INTEGER NOT NULL, extraReps INTEGER NOT NULL,
    notes TEXT, createdAt TEXT NOT NULL, side TEXT NOT NULL DEFAULT '');
  CREATE TABLE exercises (name TEXT PRIMARY KEY, createdAt TEXT NOT NULL, isUnilateral INTEGER NOT NULL DEFAULT 0);
  INSERT INTO workouts (date, exercise, reps, weight, rpe, extraReps, notes, createdAt, side)
    VALUES ('2026-06-21', 'lat pull down', 12, 30, 7, 0, NULL, '2026-06-22T09:06:17Z', ''),
           ('2026-06-21', 'rdl', 8, 40, 9, 2, 'ok', '2026-06-22T09:10:00Z', 'L');
`;

const columns = async (db, table) => Object.fromEntries((await all(db, `PRAGMA table_info(${table})`)).map((c) => [c.name, c]));

test('a fresh database migrates to the latest version', async () => {
  const db = await open(':memory:');
  await migrate(db);
  assert.equal((await get(db, 'PRAGMA user_version')).user_version, SCHEMA_VERSION);
  const cols = await columns(db, 'workouts');
  assert.equal(cols.rpe.notnull, 0);
  assert.ok(cols.durationSec && cols.source);
  await close(db);
});

test('a legacy database keeps every row and gains the new columns', async () => {
  const db = await open(':memory:');
  await exec(db, LEGACY);
  await migrate(db);

  const rows = await all(db, 'SELECT * FROM workouts ORDER BY id');
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.id, r.exercise, r.reps, r.weight, r.rpe, r.extraReps, r.notes, r.side, r.source, r.durationSec]),
    [
      [1, 'lat pull down', 12, 30, 7, 0, '', '', '', null],
      [2, 'rdl', 8, 40, 9, 2, 'ok', 'L', '', null],
    ]
  );
  const ex = await columns(db, 'exercises');
  assert.ok(ex.muscleGroup && ex.isAssisted, 'old exercises table gets the later columns');
  await close(db);
});

test('migrating twice is a no-op', async () => {
  const db = await open(':memory:');
  await exec(db, LEGACY);
  await migrate(db);
  await migrate(db);
  assert.equal((await all(db, 'SELECT * FROM workouts')).length, 2);
  await close(db);
});

test('rpe can be empty or a half point; source must be unique', async () => {
  const db = await open(':memory:');
  await migrate(db);
  const insert = (rpe, source) =>
    run(db, `INSERT INTO workouts (date, exercise, reps, weight, rpe, source, createdAt) VALUES ('2026-01-01', 'rdl', 8, 30, ?, ?, 'now')`, [rpe, source]);
  await insert(null, 'tg:1:0');
  await insert(7.5, '');
  await insert(8, ''); // many hand-typed rows share the empty source
  await assert.rejects(insert(8, 'tg:1:0'), /UNIQUE/);
  assert.deepEqual((await all(db, 'SELECT rpe FROM workouts ORDER BY id')).map((r) => r.rpe), [null, 7.5, 8]);
  await close(db);
});
