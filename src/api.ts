// Typed wrappers around the Express API. Every call throws an Error with the
// server's message on a non-2xx response, so callers can show it as-is.
import type { ExerciseInfo, NewSet, WorkoutSet } from './types.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  sets: () => request<WorkoutSet[]>('/api/workouts'),
  addSet: (set: NewSet) => request<{ id: number }>('/api/workouts', json('POST', set)),
  updateSet: (id: number, set: NewSet) => request<{ ok: true }>(`/api/workouts/${id}`, json('PUT', set)),
  deleteSet: (id: number) => request<{ ok: true }>(`/api/workouts/${id}`, { method: 'DELETE' }),
  exercises: () => request<ExerciseInfo[]>('/api/exercises/names'),
  addExercise: (e: Partial<ExerciseInfo> & { name: string }) => request<{ ok: true }>('/api/exercises', json('POST', e)),
  updateExercise: (name: string, patch: Partial<Omit<ExerciseInfo, 'name'>>) =>
    request<{ ok: true }>(`/api/exercises/${encodeURIComponent(name)}`, json('PATCH', patch)),
};
