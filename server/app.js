// HTTP routes. createApp() takes an open database instead of opening one itself,
// so tests can hand it a throwaway in-memory database.
import express from 'express';
import cors from 'cors';

/** Validate and normalize a workout body. Returns { value } or { error }. */
export function parseWorkout(body) {
  const { date, exercise, reps, weight, rpe, extraReps, notes, side, durationSec } = body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' };
  if (typeof exercise !== 'string' || exercise.trim() === '') return { error: 'exercise is required' };
  if (!Number.isInteger(reps) || reps < 0) return { error: 'reps must be a whole number >= 0' };
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) return { error: 'weight must be a number >= 0' };
  if (rpe != null && (typeof rpe !== 'number' || rpe < 1 || rpe > 10)) return { error: 'rpe must be 1-10 or empty' };
  if (extraReps != null && (!Number.isInteger(extraReps) || extraReps < 0)) return { error: 'extraReps must be a whole number >= 0' };
  if (side != null && !['', 'L', 'R'].includes(side)) return { error: "side must be '', 'L' or 'R'" };
  if (durationSec != null && (!Number.isInteger(durationSec) || durationSec <= 0)) return { error: 'durationSec must be a whole number > 0' };
  if (reps === 0 && durationSec == null) return { error: 'a set needs reps or a duration' };
  return {
    value: {
      date,
      exercise: exercise.trim(),
      reps,
      weight,
      rpe: rpe ?? null,
      extraReps: extraReps ?? 0,
      notes: typeof notes === 'string' ? notes : '',
      side: side ?? '',
      durationSec: durationSec ?? null,
    },
  };
}

export function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const fail = (res) => (err) => res.status(500).json({ error: err.message });

  app.get('/api/workouts', (req, res) => {
    db.all('SELECT * FROM workouts ORDER BY date DESC, id DESC', (err, rows) => {
      if (err) return fail(res)(err);
      res.json(rows);
    });
  });

  app.post('/api/workouts', (req, res) => {
    const { value: w, error } = parseWorkout(req.body);
    if (error) return res.status(400).json({ error });
    db.run(
      `INSERT INTO workouts (date, exercise, reps, weight, rpe, extraReps, notes, side, durationSec, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [w.date, w.exercise, w.reps, w.weight, w.rpe, w.extraReps, w.notes, w.side, w.durationSec, new Date().toISOString()],
      function onInsert(err) {
        if (err) return fail(res)(err);
        res.status(201).json({ id: this.lastID });
      }
    );
  });

  app.put('/api/workouts/:id', (req, res) => {
    const { value: w, error } = parseWorkout(req.body);
    if (error) return res.status(400).json({ error });
    db.run(
      `UPDATE workouts SET date = ?, exercise = ?, reps = ?, weight = ?, rpe = ?, extraReps = ?, notes = ?, side = ?, durationSec = ?
       WHERE id = ?`,
      [w.date, w.exercise, w.reps, w.weight, w.rpe, w.extraReps, w.notes, w.side, w.durationSec, req.params.id],
      function onUpdate(err) {
        if (err) return fail(res)(err);
        if (this.changes === 0) return res.status(404).json({ error: 'workout not found' });
        res.json({ ok: true });
      }
    );
  });

  app.delete('/api/workouts/:id', (req, res) => {
    db.run('DELETE FROM workouts WHERE id = ?', [req.params.id], function onDelete(err) {
      if (err) return fail(res)(err);
      if (this.changes === 0) return res.status(404).json({ error: 'workout not found' });
      res.json({ ok: true });
    });
  });

  app.get('/api/exercises', (req, res) => {
    db.all(
      `SELECT w.exercise AS exercise, COUNT(*) AS sessions, MAX(w.date) AS lastDate,
              COALESCE(e.isUnilateral, 0) AS isUnilateral, COALESCE(e.muscleGroup, '') AS muscleGroup,
              COALESCE(e.isAssisted, 0) AS isAssisted
       FROM workouts w
       LEFT JOIN exercises e ON e.name = w.exercise
       GROUP BY w.exercise
       ORDER BY w.exercise ASC`,
      (err, rows) => {
        if (err) return fail(res)(err);
        res.json(rows.map((r) => ({ ...r, isUnilateral: !!r.isUnilateral, isAssisted: !!r.isAssisted })));
      }
    );
  });

  // Exercise names with metadata (for dropdowns)
  app.get('/api/exercises/names', (req, res) => {
    db.all('SELECT name, isUnilateral, muscleGroup, isAssisted FROM exercises ORDER BY name ASC', (err, rows) => {
      if (err) return fail(res)(err);
      res.json(
        rows.map((r) => ({ name: r.name, isUnilateral: !!r.isUnilateral, muscleGroup: r.muscleGroup || '', isAssisted: !!r.isAssisted }))
      );
    });
  });

  // Create an exercise name (idempotent)
  app.post('/api/exercises', (req, res) => {
    const { name, isUnilateral, muscleGroup, isAssisted } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing exercise name' });
    db.run(
      'INSERT OR IGNORE INTO exercises (name, isUnilateral, muscleGroup, isAssisted, createdAt) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), isUnilateral ? 1 : 0, muscleGroup || '', isAssisted ? 1 : 0, new Date().toISOString()],
      (err) => {
        if (err) return fail(res)(err);
        res.json({ ok: true });
      }
    );
  });

  // Update exercise metadata (e.g. mark as unilateral, assign a muscle group)
  app.patch('/api/exercises/:name', (req, res) => {
    const body = req.body ?? {};
    const updates = [];
    const values = [];
    if ('isUnilateral' in body) {
      updates.push('isUnilateral = ?');
      values.push(body.isUnilateral ? 1 : 0);
    }
    if ('muscleGroup' in body) {
      updates.push('muscleGroup = ?');
      values.push(body.muscleGroup || '');
    }
    if ('isAssisted' in body) {
      updates.push('isAssisted = ?');
      values.push(body.isAssisted ? 1 : 0);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    // Only fixed column names are interpolated; user values go through `?` placeholders.
    db.run(`UPDATE exercises SET ${updates.join(', ')} WHERE name = ?`, [...values, req.params.name], (err) => {
      if (err) return fail(res)(err);
      res.json({ ok: true });
    });
  });

  app.get('/api/exercises/:name/progression', (req, res) => {
    db.all(
      `SELECT date, reps, weight, rpe, extraReps, notes, side, durationSec
       FROM workouts WHERE exercise = ? ORDER BY date ASC, id ASC`,
      [req.params.name],
      (err, rows) => {
        if (err) return fail(res)(err);
        res.json(rows);
      }
    );
  });

  return app;
}
