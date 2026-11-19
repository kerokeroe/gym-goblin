import { useMemo, useState } from 'react';
import type { ExerciseInfo, WorkoutSet } from '../types.ts';
import { MUSCLE_GROUPS } from '../types.ts';
import type { GymData } from '../useGymData.ts';
import { chartKind, groupBy, monthlyBest, setLabel, setScore } from '../lib/stats.ts';
import { formatDay } from '../lib/dates.ts';
import { PixelChart } from '../components/PixelChart.tsx';
import { ExerciseCard } from '../components/ExerciseCard.tsx';

type Props = {
  data: GymData;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onEdit: (set: WorkoutSet) => void;
  onUpdateExercise: (name: string, patch: Partial<Omit<ExerciseInfo, 'name'>>) => Promise<void>;
};

export function GainsScreen(props: Props) {
  return props.selected ? <ExerciseDetail {...props} name={props.selected} /> : <ExerciseList {...props} />;
}

function bestSet(sets: WorkoutSet[], assisted: boolean): WorkoutSet | undefined {
  return sets.reduce<WorkoutSet | undefined>(
    (best, s) => (!best || setScore(s, assisted) > setScore(best, assisted) ? s : best),
    undefined
  );
}

function ExerciseList({ data, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const byExercise = groupBy(data.sets, (s) => s.exercise);
    return [...byExercise]
      .map(([name, sets]) => {
        const assisted = data.info.get(name)?.isAssisted ?? false;
        return {
          name,
          group: data.info.get(name)?.muscleGroup || '—',
          sessions: new Set(sets.map((s) => s.date)).size,
          last: sets.reduce((m, s) => (s.date > m ? s.date : m), ''),
          best: bestSet(sets, assisted),
          prs: sets.filter((s) => data.prIds.has(s.id)).length,
        };
      })
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [data]);
  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.name.includes(q) || r.group.toLowerCase().includes(q)) : rows;

  return (
    <div className="screen">
      <label className="search">
        <span className="visually-hidden">Search exercises</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercise or muscle" />
      </label>
      <ul className="exercise-list">
        {visible.map((r) => (
          <li key={r.name}>
            <button type="button" className="exercise-row" onClick={() => onSelect(r.name)}>
              <span className="exercise-row-main">
                <strong>{r.name}</strong>
                <span className="muted small">
                  {r.group} · {r.sessions} sessions · last {formatDay(r.last)}
                </span>
              </span>
              <span className="exercise-row-best">
                {r.best && <span>{setLabel(r.best)}</span>}
                {r.prs > 0 && <span className="pixel small yellow">{r.prs} PR</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p className="empty">No exercise matches “{query}”.</p>}
    </div>
  );
}

const UNIT = { weight: ' kg', assistance: ' kg', reps: ' reps', seconds: ' s' } as const;

function ExerciseDetail({ data, name, onSelect, onEdit, onUpdateExercise }: Props & { name: string }) {
  const info = data.info.get(name);
  const assisted = info?.isAssisted ?? false;
  const sets = useMemo(() => data.sets.filter((s) => s.exercise === name), [data.sets, name]);
  const kind = chartKind(sets, assisted);
  const points = monthlyBest(sets, kind);
  const best = bestSet(sets, assisted);
  const prs = sets.filter((s) => data.prIds.has(s.id)).length;
  const sessions = [...groupBy(sets, (s) => s.date)].sort(([a], [b]) => b.localeCompare(a));
  const [saving, setSaving] = useState(false);

  async function update(patch: Partial<Omit<ExerciseInfo, 'name'>>) {
    setSaving(true);
    try {
      await onUpdateExercise(name, patch);
    } finally {
      setSaving(false);
    }
  }

  const chartLabel = {
    weight: 'Heaviest weight per month',
    assistance: 'Least assistance per month (higher on the chart = less help)',
    reps: 'Most reps per month',
    seconds: 'Longest hold per month',
  }[kind];

  return (
    <div className="screen">
      <button type="button" className="back" onClick={() => onSelect(null)}>
        ← All exercises
      </button>
      <section className="hero hero-pr detail-hero">
        <div className="hero-text">
          <h2 className="detail-name">{name}</h2>
          {best && (
            <p className="big-number">
              {setLabel(best)}
              <span className="muted small"> best set · {formatDay(best.date)}</span>
            </p>
          )}
        </div>
        <PixelChart points={points} unit={UNIT[kind]} lowerIsBetter={kind === 'assistance'} label={chartLabel} />
        <p className="muted small">{chartLabel}</p>
      </section>

      <section className="stat-grid" aria-label="Totals">
        <div className="stat">
          <span className="pixel small muted">SESSIONS</span>
          <strong>{sessions.length}</strong>
        </div>
        <div className="stat">
          <span className="pixel small muted">SETS</span>
          <strong>{sets.length}</strong>
        </div>
        <div className="stat">
          <span className="pixel small muted">PRS</span>
          <strong className="yellow">{prs}</strong>
        </div>
      </section>

      <section className="panel settings" aria-label="Exercise settings">
        <h2 className="pixel small muted">SETTINGS</h2>
        <label>
          Muscle group
          <select value={info?.muscleGroup ?? ''} disabled={saving || !info} onChange={(e) => update({ muscleGroup: e.target.value })}>
            <option value="">Unassigned</option>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={info?.isUnilateral ?? false} disabled={saving || !info} onChange={(e) => update({ isUnilateral: e.target.checked })} />
          One side at a time (left / right)
        </label>
        <label className="check">
          <input type="checkbox" checked={assisted} disabled={saving || !info} onChange={(e) => update({ isAssisted: e.target.checked })} />
          Assisted: less weight is better
        </label>
      </section>

      <section aria-label="Recent sessions" className="day">
        <h2 className="pixel small muted">RECENT</h2>
        {sessions.slice(0, 6).map(([day, list]) => (
          <div key={day}>
            <p className="muted small session-date">{formatDay(day)}</p>
            <ExerciseCard exercise={name} sets={list} info={info} prIds={data.prIds} onEdit={onEdit} />
          </div>
        ))}
      </section>
    </div>
  );
}
