// Bottom sheet for editing or deleting one set.
import { useEffect, useRef, useState } from 'react';
import type { NewSet, Side, WorkoutSet } from '../types.ts';

type Props = {
  set: WorkoutSet;
  exerciseNames: string[];
  onSave: (id: number, set: NewSet) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
};

// Form fields are strings while typing; they become numbers on save.
type Draft = Record<'date' | 'exercise' | 'weight' | 'reps' | 'extraReps' | 'rpe' | 'durationSec' | 'notes', string> & { side: Side };

const toDraft = (s: WorkoutSet): Draft => ({
  date: s.date,
  exercise: s.exercise,
  weight: String(s.weight),
  reps: String(s.reps),
  extraReps: String(s.extraReps),
  rpe: s.rpe == null ? '' : String(s.rpe),
  durationSec: s.durationSec == null ? '' : String(s.durationSec),
  notes: s.notes,
  side: s.side,
});

export function EditSheet({ set, exerciseNames, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(() => toDraft(set));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [key]: e.target.value }),
  });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    run(() =>
      onSave(set.id, {
        date: draft.date,
        exercise: draft.exercise.trim().toLowerCase(),
        weight: num(draft.weight) ?? 0,
        reps: num(draft.reps) ?? 0,
        extraReps: num(draft.extraReps) ?? 0,
        rpe: num(draft.rpe),
        durationSec: num(draft.durationSec),
        notes: draft.notes,
        side: draft.side,
      })
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        <h2 id="edit-title">Edit set</h2>
        <div className="form-grid">
          <label className="span-2">
            Exercise
            <input ref={first} list="exercise-names" {...field('exercise')} required />
          </label>
          <datalist id="exercise-names">
            {exerciseNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <label>
            Date
            <input type="date" {...field('date')} required />
          </label>
          <label>
            Side
            <select {...field('side')}>
              <option value="">Both</option>
              <option value="L">Left</option>
              <option value="R">Right</option>
            </select>
          </label>
          <label>
            Weight (kg)
            <input type="number" inputMode="decimal" step="0.01" min="0" {...field('weight')} />
          </label>
          <label>
            Reps
            <input type="number" inputMode="numeric" min="0" step="1" {...field('reps')} />
          </label>
          <label>
            Extra reps
            <input type="number" inputMode="numeric" min="0" step="1" {...field('extraReps')} />
          </label>
          <label>
            RPE
            <input type="number" inputMode="decimal" min="1" max="10" step="0.5" placeholder="—" {...field('rpe')} />
          </label>
          <label>
            Seconds
            <input type="number" inputMode="numeric" min="1" step="1" placeholder="—" {...field('durationSec')} />
          </label>
          <label>
            Notes
            <input {...field('notes')} />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="sheet-actions">
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => confirm('Delete this set?') && run(() => onDelete(set.id))}
          >
            Delete
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
