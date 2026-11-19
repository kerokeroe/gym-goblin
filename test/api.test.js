// API tests: start the real Express app on a random port against an in-memory
// database and talk to it with fetch, the same way the browser does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open, migrate, close } from '../server/db.js';
import { createApp } from '../server/app.js';

let db;
let server;
let base;

before(async () => {
  db = await open(':memory:');
  await migrate(db);
  server = createApp(db).listen(0); // 0 = any free port
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await close(db);
});

const send = (method, path, body) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });

const valid = { date: '2026-11-16', exercise: 'hip thrust', reps: 8, weight: 90, rpe: 8, extraReps: 0, notes: '', side: '' };

test('POST then GET returns the saved set', async () => {
  const res = await send('POST', '/api/workouts', valid);
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const rows = await (await send('GET', '/api/workouts')).json();
  const saved = rows.find((r) => r.id === id);
  assert.equal(saved.exercise, 'hip thrust');
  assert.equal(saved.weight, 90);
});

test('RPE is optional and a timed set needs no reps', async () => {
  const res = await send('POST', '/api/workouts', { ...valid, exercise: 'plank', reps: 0, weight: 0, rpe: null, durationSec: 60 });
  assert.equal(res.status, 201);
});

test('invalid bodies are rejected with a reason', async () => {
  const cases = [
    [{ ...valid, date: '16.11.2026' }, /date/],
    [{ ...valid, exercise: '  ' }, /exercise/],
    [{ ...valid, reps: '8' }, /reps/],
    [{ ...valid, weight: -1 }, /weight/],
    [{ ...valid, rpe: 11 }, /rpe/],
    [{ ...valid, side: 'left' }, /side/],
    [{ ...valid, reps: 0 }, /reps or a duration/],
  ];
  for (const [body, reason] of cases) {
    const res = await send('POST', '/api/workouts', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await res.json()).error, reason);
  }
});

test('PUT and DELETE return 404 for a missing set', async () => {
  assert.equal((await send('PUT', '/api/workouts/99999', valid)).status, 404);
  assert.equal((await send('DELETE', '/api/workouts/99999')).status, 404);
});

test('PUT updates a set', async () => {
  const { id } = await (await send('POST', '/api/workouts', valid)).json();
  assert.equal((await send('PUT', `/api/workouts/${id}`, { ...valid, reps: 10 })).status, 200);
  const rows = await (await send('GET', '/api/exercises/hip%20thrust/progression')).json();
  assert.ok(rows.some((r) => r.reps === 10));
});

test('exercises can be created and updated', async () => {
  assert.equal((await send('POST', '/api/exercises', { name: 'rdl', muscleGroup: 'Hamstrings' })).status, 200);
  assert.equal((await send('PATCH', '/api/exercises/rdl', { isUnilateral: true })).status, 200);
  const names = await (await send('GET', '/api/exercises/names')).json();
  assert.deepEqual(names.find((n) => n.name === 'rdl'), { name: 'rdl', isUnilateral: true, muscleGroup: 'Hamstrings', isAssisted: false });
  assert.equal((await send('PATCH', '/api/exercises/rdl', {})).status, 400);
});
