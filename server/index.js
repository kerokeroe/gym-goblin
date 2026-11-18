import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFolder = path.join(__dirname, '../data');
const dbPath = path.join(dataFolder, 'gym.db');

const fs = await import('fs');
if (!(await fs.promises.stat(dataFolder).catch(() => false))) {
  await fs.promises.mkdir(dataFolder, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(
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
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS exercises (
      name TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL
    )`
  );

  // Migrations for columns added after initial release
  db.run(`ALTER TABLE workouts ADD COLUMN side TEXT NOT NULL DEFAULT ''`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('Failed to add workouts.side column:', err.message);
    }
  });
  db.run(`ALTER TABLE exercises ADD COLUMN isUnilateral INTEGER NOT NULL DEFAULT 0`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('Failed to add exercises.isUnilateral column:', err.message);
    }
  });
  db.run(`ALTER TABLE exercises ADD COLUMN muscleGroup TEXT NOT NULL DEFAULT ''`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('Failed to add exercises.muscleGroup column:', err.message);
    }
  });
  db.run(`ALTER TABLE exercises ADD COLUMN isAssisted INTEGER NOT NULL DEFAULT 0`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('Failed to add exercises.isAssisted column:', err.message);
    }
  });
});

app.get('/api/workouts', (req, res) => {
  db.all('SELECT * FROM workouts ORDER BY date DESC, id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/workouts', (req, res) => {
  const { date, exercise, reps, weight, rpe, extraReps, notes, side } = req.body;
  if (!date || !exercise || reps == null || weight == null || rpe == null || extraReps == null) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const stmt = db.prepare(
    'INSERT INTO workouts (date, exercise, reps, weight, rpe, extraReps, notes, side, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(date, exercise, reps, weight, rpe, extraReps, notes || '', side || '', new Date().toISOString(), function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
  stmt.finalize();
});

app.get('/api/exercises', (req, res) => {
  db.all(
    `SELECT w.exercise as exercise, COUNT(*) as sessions, MAX(w.date) as lastDate, COALESCE(e.isUnilateral, 0) as isUnilateral, COALESCE(e.muscleGroup, '') as muscleGroup, COALESCE(e.isAssisted, 0) as isAssisted
     FROM workouts w
     LEFT JOIN exercises e ON e.name = w.exercise
     GROUP BY w.exercise
     ORDER BY w.exercise ASC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map((r) => ({ ...r, isUnilateral: !!r.isUnilateral, isAssisted: !!r.isAssisted })));
    }
  );
});

// Return exercise names with metadata (for dropdowns)
app.get('/api/exercises/names', (req, res) => {
  db.all('SELECT name, isUnilateral, muscleGroup, isAssisted FROM exercises ORDER BY name ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map((r) => ({ name: r.name, isUnilateral: !!r.isUnilateral, muscleGroup: r.muscleGroup || '', isAssisted: !!r.isAssisted })));
  });
});

// Create a new exercise name (idempotent)
app.post('/api/exercises', (req, res) => {
  const { name, isUnilateral, muscleGroup, isAssisted } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing exercise name' });
  const stmt = db.prepare('INSERT OR IGNORE INTO exercises (name, isUnilateral, muscleGroup, isAssisted, createdAt) VALUES (?, ?, ?, ?, ?)');
  stmt.run(name.trim(), isUnilateral ? 1 : 0, muscleGroup || '', isAssisted ? 1 : 0, new Date().toISOString(), function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
  stmt.finalize();
});

// Update exercise metadata (e.g. mark as unilateral, assign a muscle group)
app.patch('/api/exercises/:name', (req, res) => {
  const { name } = req.params;
  const updates = [];
  const values = [];
  if ('isUnilateral' in req.body) {
    updates.push('isUnilateral = ?');
    values.push(req.body.isUnilateral ? 1 : 0);
  }
  if ('muscleGroup' in req.body) {
    updates.push('muscleGroup = ?');
    values.push(req.body.muscleGroup || '');
  }
  if ('isAssisted' in req.body) {
    updates.push('isAssisted = ?');
    values.push(req.body.isAssisted ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(name);
  const stmt = db.prepare(`UPDATE exercises SET ${updates.join(', ')} WHERE name = ?`);
  stmt.run(...values, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
  stmt.finalize();
});

app.get('/api/exercises/:name/progression', (req, res) => {
  const name = req.params.name;
  db.all(
    'SELECT date, reps, weight, rpe, extraReps, notes, side FROM workouts WHERE exercise = ? ORDER BY date ASC, id ASC',
    [name],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Update a workout
app.put('/api/workouts/:id', (req, res) => {
  const { id } = req.params;
  const { date, exercise, reps, weight, rpe, extraReps, notes, side } = req.body;
  if (!date || !exercise || reps == null || weight == null || rpe == null || extraReps == null) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  const stmt = db.prepare(
    'UPDATE workouts SET date = ?, exercise = ?, reps = ?, weight = ?, rpe = ?, extraReps = ?, notes = ?, side = ? WHERE id = ?'
  );
  stmt.run(date, exercise, reps, weight, rpe, extraReps, notes || '', side || '', id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
  stmt.finalize();
});

// Delete a workout
app.delete('/api/workouts/:id', (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare('DELETE FROM workouts WHERE id = ?');
  stmt.run(id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
  stmt.finalize();
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Gym Tracker API running at http://localhost:${port}`);
});
