// Import reviewed sets from the extracted Telegram files into gym.db.
//
//   node scripts/import/import-telegram.js <extracted-dir> <filtered.json> [--db data/gym.db] [--apply]
//
// Without --apply this is a dry run: everything happens on a temporary copy of the
// database and only a report is printed. With --apply the real file is backed up
// first and all writes happen in one transaction (all or nothing).
//
// Rules:
// - days that already have hand-typed sets (source = '') are skipped entirely,
//   so nothing gets logged twice;
// - sets whose source id is already in the database are skipped, so the import
//   can be re-run safely after fixing the extracted files;
// - known misspelled exercise names in the database are renamed.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { openAndMigrate, all, run, transaction, close } from '../../server/db.js';
import { parseExtracted, assignSources } from './extracted-format.js';

export const RENAMES = {
  'bulfarian split squat': 'bulgarian split squat',
  'hipp abduction': 'hip abduction',
  'single leg ht': 'single leg hip thrust',
};

// Metadata for exercises that appear in the import. Existing rows keep their
// settings; only an empty muscle group gets filled in.
export const EXERCISE_INFO = {
  'ab crunch': { muscleGroup: 'Core' },
  'assisted pull up': { muscleGroup: 'Back', isAssisted: true },
  'australian row': { muscleGroup: 'Back' },
  'back extension': { muscleGroup: 'Glutes' },
  'bicep curl': { muscleGroup: 'Biceps' },
  'bird dog': { muscleGroup: 'Core' },
  'bulgarian split squat': { muscleGroup: 'Quads', isUnilateral: true },
  'cable abduction': { muscleGroup: 'Glutes' },
  'cable row': { muscleGroup: 'Back' },
  'cable t bar row': { muscleGroup: 'Back' },
  'calf raises': { muscleGroup: 'Calves' },
  'chest press': { muscleGroup: 'Chest' },
  'db press': { muscleGroup: 'Chest' },
  'dead bug': { muscleGroup: 'Core' },
  'dead hang': { muscleGroup: 'Back' },
  'face pull': { muscleGroup: 'Back' },
  'front raise': { muscleGroup: 'Shoulders' },
  'glute bridge': { muscleGroup: 'Glutes' },
  'glute kickbacks': { muscleGroup: 'Glutes', isUnilateral: true },
  'goblet squat': { muscleGroup: 'Quads' },
  'hack squat': { muscleGroup: 'Quads' },
  'hanging knee raise': { muscleGroup: 'Core' },
  'hip abduction': { muscleGroup: 'Glutes' },
  'hip adduction': { muscleGroup: 'Quads' },
  'hip extension': { muscleGroup: 'Glutes' },
  'hip thrust': { muscleGroup: 'Glutes' },
  'incline db press': { muscleGroup: 'Chest' },
  'incline push up': { muscleGroup: 'Chest' },
  'iso-lateral incline press': { muscleGroup: 'Chest' },
  'kas glute bridge': { muscleGroup: 'Glutes' },
  'knee push up': { muscleGroup: 'Chest' },
  'lat pull down': { muscleGroup: 'Back' },
  'lateral raises': { muscleGroup: 'Shoulders' },
  'leg curls': { muscleGroup: 'Hamstrings' },
  'leg extension': { muscleGroup: 'Quads' },
  'leg press': { muscleGroup: 'Quads' },
  'leg raise': { muscleGroup: 'Core' },
  'negative pull up': { muscleGroup: 'Back' },
  'overhead press': { muscleGroup: 'Shoulders' },
  'pec deck': { muscleGroup: 'Chest' },
  plank: { muscleGroup: 'Core' },
  'push up': { muscleGroup: 'Chest' },
  rdl: { muscleGroup: 'Hamstrings' },
  'rear fly': { muscleGroup: 'Shoulders' },
  'scapular pull up': { muscleGroup: 'Back' },
  'single leg hip thrust': { muscleGroup: 'Glutes', isUnilateral: true },
  'single leg rdl': { muscleGroup: 'Hamstrings', isUnilateral: true },
  'sissy push up': { muscleGroup: 'Chest' },
  'smith machine squat': { muscleGroup: 'Quads' },
  'step ups': { muscleGroup: 'Quads', isUnilateral: true },
  'straight arm pulldown': { muscleGroup: 'Back' },
  'sumo squat': { muscleGroup: 'Quads' },
  't bar row': { muscleGroup: 'Back' },
  'tricep push down': { muscleGroup: 'Triceps' },
  'wide cable row': { muscleGroup: 'Back' },
};

/** Read every *.txt in the extracted folder and return sets with source ids. */
export function loadExtracted(dir, messages) {
  const dateOf = (msg) => messages[msg]?.date?.slice(0, 10);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  const sets = [];
  const reviews = [];
  for (const file of files) {
    const parsed = parseExtracted(fs.readFileSync(path.join(dir, file), 'utf8'), dateOf, file);
    sets.push(...parsed.sets);
    reviews.push(...parsed.reviews);
  }
  return { sets: assignSources(sets), reviews, files };
}

async function renameExercises(db) {
  const done = [];
  for (const [from, to] of Object.entries(RENAMES)) {
    const { changes } = await run(db, 'UPDATE workouts SET exercise = ? WHERE exercise = ?', [to, from]);
    const [old] = await all(db, 'SELECT * FROM exercises WHERE name = ?', [from]);
    if (old) {
      // Keep the old row's settings under the new name (unless the new name exists).
      await run(
        db,
        'INSERT OR IGNORE INTO exercises (name, createdAt, isUnilateral, muscleGroup, isAssisted) VALUES (?, ?, ?, ?, ?)',
        [to, old.createdAt, old.isUnilateral, old.muscleGroup, old.isAssisted]
      );
      await run(db, 'DELETE FROM exercises WHERE name = ?', [from]);
    }
    if (changes > 0 || old) done.push(`${from} -> ${to} (${changes} sets)`);
  }
  return done;
}

async function upsertExercises(db, names) {
  const added = [];
  for (const name of names) {
    const info = EXERCISE_INFO[name] ?? {};
    const { changes } = await run(
      db,
      'INSERT OR IGNORE INTO exercises (name, createdAt, isUnilateral, muscleGroup, isAssisted) VALUES (?, ?, ?, ?, ?)',
      [name, new Date().toISOString(), info.isUnilateral ? 1 : 0, info.muscleGroup ?? '', info.isAssisted ? 1 : 0]
    );
    if (changes > 0) added.push(name);
    else if (info.muscleGroup) {
      await run(db, "UPDATE exercises SET muscleGroup = ? WHERE name = ? AND muscleGroup = ''", [info.muscleGroup, name]);
    }
  }
  return added;
}

/** Run the whole import against an open database. Returns a report object. */
export async function importSets(db, sets) {
  return transaction(db, async () => {
    const renamed = await renameExercises(db);

    const handTyped = new Set(
      (await all(db, "SELECT DISTINCT date FROM workouts WHERE source = ''")).map((r) => r.date)
    );
    const known = new Set((await all(db, "SELECT source FROM workouts WHERE source <> ''")).map((r) => r.source));

    const toInsert = [];
    const skippedDays = new Set();
    let alreadyImported = 0;
    for (const s of sets) {
      if (handTyped.has(s.date)) skippedDays.add(s.date);
      else if (known.has(s.source)) alreadyImported++;
      else toInsert.push(s);
    }

    const newExercises = await upsertExercises(db, [...new Set(toInsert.map((s) => s.exercise))].sort());

    const createdAt = new Date().toISOString();
    for (const s of toInsert) {
      await run(
        db,
        `INSERT INTO workouts (date, exercise, reps, weight, rpe, extraReps, notes, side, durationSec, source, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.date, s.exercise, s.reps, s.weight, s.rpe, s.extraReps, s.notes, s.side, s.durationSec, s.source, createdAt]
      );
    }

    return {
      inserted: toInsert.length,
      days: new Set(toInsert.map((s) => s.date)).size,
      alreadyImported,
      skippedDays: [...skippedDays].sort(),
      newExercises,
      renamed,
    };
  });
}

function printReport(report, reviews, dryRun) {
  console.log(dryRun ? '\nDRY RUN - nothing was written. Re-run with --apply to import.\n' : '\nImported.\n');
  console.log(`sets to insert:    ${report.inserted} across ${report.days} days`);
  console.log(`already imported:  ${report.alreadyImported}`);
  console.log(`days skipped (already typed by hand): ${report.skippedDays.length}`);
  if (report.renamed.length) console.log(`renamed: ${report.renamed.join('; ')}`);
  if (report.newExercises.length) console.log(`new exercises (${report.newExercises.length}): ${report.newExercises.join(', ')}`);
  const open = reviews.length;
  console.log(`\nreview items: ${open} (defaults used; edit the .txt files and re-run to change them)`);
  for (const r of reviews) console.log(`  ${r.where}  [${r.fallback === 'skip' ? 'skipped' : 'imported'}]  ${r.question}`);
}

async function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dbPath = path.join(here, '../../data/gym.db');
  let apply = false;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true;
    else if (argv[i] === '--db') dbPath = argv[++i];
    else positional.push(argv[i]);
  }
  const [dir, messagesPath] = positional;
  if (!dir || !messagesPath) {
    console.error('Usage: node scripts/import/import-telegram.js <extracted-dir> <filtered.json> [--db data/gym.db] [--apply]');
    process.exit(1);
  }

  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  const { sets, reviews, files } = loadExtracted(dir, messages);
  console.log(`read ${sets.length} sets from ${files.length} files`);

  let target = dbPath;
  if (apply) {
    const backup = `${dbPath}.bak.${Date.now()}`;
    fs.copyFileSync(dbPath, backup);
    console.log(`backup: ${backup}`);
  } else {
    target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-import-')), 'gym.db');
    fs.copyFileSync(dbPath, target);
  }

  const db = await openAndMigrate(target);
  try {
    printReport(await importSets(db, sets), reviews, !apply);
  } finally {
    await close(db);
    if (!apply) fs.rmSync(path.dirname(target), { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
