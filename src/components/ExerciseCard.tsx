// One exercise of one day: its name and every set as a tappable chip.
import type { ExerciseInfo, WorkoutSet } from '../types.ts';
import { setLabel } from '../lib/stats.ts';

type Props = {
  exercise: string;
  sets: WorkoutSet[];
  info?: ExerciseInfo;
  prIds: Set<number>;
  onEdit: (set: WorkoutSet) => void;
};

export function ExerciseCard({ exercise, sets, info, prIds, onEdit }: Props) {
  const hasPR = sets.some((s) => prIds.has(s.id));
  // For unilateral work the weight is the same across sets, so show it once.
  const weights = new Set(sets.map((s) => s.weight));
  const sharedWeight = info?.isUnilateral && weights.size === 1 ? [...weights][0] : null;
  return (
    <article className="exercise-card">
      <header>
        <h3>
          {exercise}
          {sharedWeight ? <span className="muted"> {sharedWeight} kg{sets[0].notes.includes('per hand') ? '/hand' : ''}</span> : null}
        </h3>
        {hasPR && <span className="badge-pr">PR</span>}
      </header>
      <ul className="chips">
        {sets.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={prIds.has(s.id) ? 'chip chip-pr' : 'chip'}
              onClick={() => onEdit(s)}
              aria-label={`Edit set ${setLabel(s)}`}
              title={s.notes || undefined}
            >
              {setLabel(s, sharedWeight !== null)}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
