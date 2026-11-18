import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'gym.db');
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.all('SELECT id, date, exercise, reps, weight, rpe, extraReps, notes FROM workouts ORDER BY date DESC, id DESC LIMIT 20', (err, rows) => {
    if (err) {
      console.error('Query error:', err.message);
      process.exit(1);
    }
    console.log('--- Sample workout rows (latest 20) ---');
    rows.forEach((r) => {
      console.log(`${r.id}: ${r.date} | ${r.exercise} | ${r.reps} reps | ${r.weight} weight | RPE ${r.rpe} | extra ${r.extraReps}`);
    });
    db.get('SELECT COUNT(*) as cnt, MAX(weight) as maxW, AVG(weight) as avgW FROM workouts', (err2, stats) => {
      if (err2) {
        console.error('Stats query error:', err2.message);
        process.exit(1);
      }
      console.log('\n--- Summary ---');
      console.log(`Rows: ${stats.cnt}`);
      console.log(`Max weight: ${stats.maxW}`);
      console.log(`Avg weight: ${Number(stats.avgW).toFixed(2)}`);
      db.close();
    });
  });
});
