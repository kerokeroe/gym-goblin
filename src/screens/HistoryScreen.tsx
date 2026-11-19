import { useMemo, useState } from 'react';
import type { WorkoutSet } from '../types.ts';
import type { GymData } from '../useGymData.ts';
import { groupBy } from '../lib/stats.ts';
import { addDays, formatDay, today, weekStart } from '../lib/dates.ts';
import { ExerciseCard } from '../components/ExerciseCard.tsx';

const WEEKS = 16;
const PAGE = 10;

export function HistoryScreen({ data, onEdit }: { data: GymData; onEdit: (set: WorkoutSet) => void }) {
  const { sets, info, prIds } = data;
  const [shown, setShown] = useState(PAGE);

  const days = useMemo(() => {
    const byDay = groupBy([...sets].sort((a, b) => a.id - b.id), (s) => s.date);
    return [...byDay].sort(([a], [b]) => b.localeCompare(a));
  }, [sets]);

  // Activity grid: one column per week (oldest left), one row per weekday.
  const grid = useMemo(() => {
    const perDay = new Map(days.map(([d, list]) => [d, list.length]));
    const firstMonday = addDays(weekStart(today()), -7 * (WEEKS - 1));
    return Array.from({ length: WEEKS * 7 }, (_, i) => {
      const week = Math.floor(i / 7);
      const day = addDays(firstMonday, week * 7 + (i % 7));
      const count = perDay.get(day) ?? 0;
      const level = day > today() ? -1 : count === 0 ? 0 : count < 10 ? 1 : count < 20 ? 2 : 3;
      return { day, count, level, row: (i % 7) + 1, col: week + 1 };
    });
  }, [days]);

  return (
    <div className="screen">
      <section aria-label="Last 16 weeks" className="panel">
        <h2 className="pixel small muted">LAST {WEEKS} WEEKS</h2>
        <div className="activity" role="img" aria-label={`${grid.filter((c) => c.count > 0).length} workout days in the last ${WEEKS} weeks`}>
          {grid.map((c) => (
            <span
              key={c.day}
              className={`cell l${c.level}`}
              style={{ gridRow: c.row, gridColumn: c.col }}
              title={c.level >= 0 ? `${formatDay(c.day)}: ${c.count} sets` : undefined}
            />
          ))}
        </div>
      </section>

      {days.length === 0 && <p className="empty">No workouts yet. Log one on the LOG tab.</p>}
      {days.slice(0, shown).map(([day, list]) => {
        const prs = list.filter((s) => prIds.has(s.id)).length;
        return (
          <section key={day} className="day" aria-label={formatDay(day)}>
            <h2 className="day-head">
              <span>{formatDay(day)}</span>
              <span className="muted small">
                {list.length} sets{prs ? ` · ${prs} PR${prs > 1 ? 's' : ''}` : ''}
              </span>
            </h2>
            {[...groupBy(list, (s) => s.exercise)].map(([exercise, exSets]) => (
              <ExerciseCard key={exercise} exercise={exercise} sets={exSets} info={info.get(exercise)} prIds={prIds} onEdit={onEdit} />
            ))}
          </section>
        );
      })}
      {shown < days.length && (
        <button type="button" className="btn btn-ghost wide" onClick={() => setShown(shown + PAGE)}>
          Show older ({days.length - shown} more days)
        </button>
      )}
    </div>
  );
}
