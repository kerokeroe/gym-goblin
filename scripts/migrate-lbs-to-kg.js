import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const dataFolder = path.join(process.cwd(), 'data');
const dbPath = path.join(dataFolder, 'gym.db');

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found at', dbPath);
    process.exit(1);
  }

  const bakPath = path.join(dataFolder, `gym.db.bak.${Date.now()}`);
  await fs.promises.copyFile(dbPath, bakPath);
  console.log('Backup created at', bakPath);

  const sqlite = sqlite3.verbose();
  const db = new sqlite.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open database:', err.message);
      process.exit(1);
    }
  });

  // Check max weight to avoid double-conversion (simple heuristic)
  db.get('SELECT MAX(weight) as maxWeight, COUNT(*) as cnt FROM workouts', (err, row) => {
    if (err) {
      console.error('Query error:', err.message);
      process.exit(1);
    }

    const maxW = row?.maxWeight || 0;
    const count = row?.cnt || 0;
    if (count === 0) {
      console.log('No workouts found. Nothing to migrate.');
      db.close();
      process.exit(0);
    }

    console.log(`Found ${count} workout rows; max weight = ${maxW}`);
    const force = process.argv.includes('--force');
    if (maxW <= 150 && !force) {
      console.error('Max weight looks small (<=150). This may already be in kg.');
      console.error('If you are sure weights are in lbs and need converting, re-run with --force');
      db.close();
      process.exit(2);
    }

    // Convert lbs -> kg
    const factor = 0.45359237;
    const sql = `UPDATE workouts SET weight = ROUND(weight * ${factor}, 2)`;
    db.run(sql, function (err) {
      if (err) {
        console.error('Migration failed:', err.message);
        db.close();
        process.exit(1);
      }
      console.log(`Migration complete — ${this.changes} rows updated.`);
      db.close();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
