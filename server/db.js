// Database access and schema migrations.
//
// The schema version lives in SQLite's built-in `PRAGMA user_version` (an integer
// stored in the file header). Each migration moves the file from version N to N+1,
// so a fresh database and a two-year-old one end up with the same shape.
import sqlite3 from 'sqlite3';

// --- Promise wrappers around the callback-style sqlite3 API -----------------

export function open(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve(db)));
  });
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      // `this` holds lastID / changes, so this must stay a regular function.
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

export function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve())));
}

export function close(db) {
  return new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
}

/** Run `fn` inside a transaction: all of its writes land, or none do. */
export async function transaction(db, fn) {
  await exec(db, 'BEGIN');
  try {
    const result = await fn();
    await exec(db, 'COMMIT');
    return result;
  } catch (err) {
    await exec(db, 'ROLLBACK');
    throw err;
  }
}

// --- Migrations ---------------------------------------------------------------

async function addColumnIfMissing(db, table, column, definition) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// v1: the original schema, including the columns that were bolted on with
// ALTER TABLE before versioning existed (old files may have some of them).
async function toV1(db) {
  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS workouts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL,
       exercise TEXT NOT NULL,
       reps INTEGER NOT NULL,
       weight REAL NOT NULL,
       rpe INTEGER NOT NULL,
       extraReps INTEGER NOT NULL,
       notes TEXT,
       createdAt TEXT NOT NULL
     );
     CREATE TABLE IF NOT EXISTS exercises (
       name TEXT PRIMARY KEY,
       createdAt TEXT NOT NULL
     );`
  );
  await addColumnIfMissing(db, 'workouts', 'side', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'exercises', 'isUnilateral', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'exercises', 'muscleGroup', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'exercises', 'isAssisted', 'INTEGER NOT NULL DEFAULT 0');
  await exec(db, 'PRAGMA user_version = 1');
}

// v2: RPE becomes optional (and can be 7.5), timed sets get durationSec, and
// `source` records where an imported set came from so re-imports skip it.
// SQLite can't drop NOT NULL with ALTER TABLE, so the table is rebuilt:
// create the new shape, copy every row, swap names - inside one transaction.
async function toV2(db) {
  await transaction(db, () =>
    exec(
      db,
      `CREATE TABLE workouts_v2 (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         date TEXT NOT NULL,
         exercise TEXT NOT NULL,
         reps INTEGER NOT NULL,
         weight REAL NOT NULL,
         rpe REAL,
         extraReps INTEGER NOT NULL DEFAULT 0,
         notes TEXT NOT NULL DEFAULT '',
         side TEXT NOT NULL DEFAULT '',
         durationSec INTEGER,
         source TEXT NOT NULL DEFAULT '',
         createdAt TEXT NOT NULL
       );
       INSERT INTO workouts_v2 (id, date, exercise, reps, weight, rpe, extraReps, notes, side, createdAt)
         SELECT id, date, exercise, reps, weight, rpe, extraReps, COALESCE(notes, ''), side, createdAt FROM workouts;
       DROP TABLE workouts;
       ALTER TABLE workouts_v2 RENAME TO workouts;
       CREATE INDEX idx_workouts_date ON workouts(date);
       CREATE INDEX idx_workouts_exercise ON workouts(exercise);
       CREATE UNIQUE INDEX idx_workouts_source ON workouts(source) WHERE source <> '';
       PRAGMA user_version = 2;`
    )
  );
}

const MIGRATIONS = [toV1, toV2];
export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db) {
  const { user_version: version } = await get(db, 'PRAGMA user_version');
  for (let v = version; v < MIGRATIONS.length; v++) {
    await MIGRATIONS[v](db);
  }
}

/** Open a database file and bring it to the latest schema. */
export async function openAndMigrate(file) {
  const db = await open(file);
  await migrate(db);
  return db;
}
