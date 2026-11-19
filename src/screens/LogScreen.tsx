import { useMemo, useState } from 'react';
import type { NewSet, WorkoutSet } from '../types.ts';
import type { GymData } from '../useGymData.ts';
import { parseQuickLog } from '../lib/quicklog.ts';
import { groupBy, setLabel, XP_PER_PR } from '../lib/stats.ts';
import { today, formatDay, addDays } from '../lib/dates.ts';
import { Goblin, type GoblinMood } from '../components/Goblin.tsx';
import { ExerciseCard } from '../components/ExerciseCard.tsx';

type Props = {
  data: GymData;
  onLog: (set: NewSet) => Promise<void>;
  onEdit: (set: WorkoutSet) => void;
};

export function LogScreen({ data, onLog, onEdit }: Props) {
  const { sets, exercises, info, prIds, level } = data;
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const names = useMemo(() => exercises.map((e) => e.name), [exercises]);
  // Only a name typed so far (e.g. kept from the last set): wait for numbers, no error yet.
  const parsed = /\d/.test(text) ? parseQuickLog(text, names) : null;

  const daySets = useMemo(
    () => sets.filter((s) => s.date === date).sort((a, b) => a.id - b.id),
    [sets, date]
  );
  const byExercise = groupBy(daySets, (s) => s.exercise);
  const dayPRs = daySets.filter((s) => prIds.has(s.id));
  const lastWorkout = sets.reduce((max, s) => (s.date > max ? s.date : max), '');

  const hero = heroFor(dayPRs.at(-1), daySets.length, lastWorkout, date);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) return;
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLog({ ...parsed.set, date });
      // Keep the exercise name so the next set only needs numbers.
      setText(`${parsed.set.exercise} `);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <section aria-label="Level" className="level">
        <div className="level-row pixel">
          <span className="accent">
            LVL {level.level} · {level.title.toUpperCase()}
          </span>
          <span className="muted">
            {level.xpIntoLevel} / {level.xpForNext} XP
          </span>
        </div>
        <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={level.xpForNext} aria-valuenow={level.xpIntoLevel}>
          <div style={{ width: `${(level.xpIntoLevel / level.xpForNext) * 100}%` }} />
        </div>
      </section>

      <section className={`hero ${hero.mood === 'cheer' ? 'hero-pr' : ''}`}>
        <Goblin mood={hero.mood} size={96} />
        <div className="hero-text">
          <p className={`pixel hero-title ${hero.mood === 'cheer' ? 'yellow' : 'accent'}`}>{hero.title}</p>
          <p>{hero.body}</p>
          {hero.mood === 'cheer' && <p className="pixel accent small">+{XP_PER_PR} XP</p>}
        </div>
      </section>

      <form className="quicklog" onSubmit={submit}>
        <div className="quicklog-head">
          <label htmlFor="quicklog" className="pixel small muted">
            LOG A SET
          </label>
          <label className="date-pick">
            <span className="visually-hidden">Date</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </label>
        </div>
        <div className="quicklog-row">
          <input
            id="quicklog"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            placeholder="hip thrust 90 10"
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="send"
            aria-describedby="quicklog-hint"
          />
          <button type="submit" className="btn btn-primary pixel" disabled={busy || !parsed?.ok}>
            LOG
          </button>
        </div>
        <p id="quicklog-hint" className={`hint ${error || (parsed && !parsed.ok) ? 'hint-error' : ''}`} aria-live="polite">
          {error
            ? error
            : !parsed
              ? text.trim()
                ? `→ ${text.trim()} · now the numbers, e.g. “90 10”`
                : 'Try “6+6 9 L”, “40 5+2”, “50 lbs 12”, “45 sec”, “@8”'
              : parsed.ok
                ? `→ ${parsed.set.exercise}${parsed.isNewExercise ? ' (new)' : ''} · ${preview(parsed.set)}${
                    parsed.candidates.length > 1 ? ` · did you mean ${parsed.candidates.slice(0, 3).join(', ')}?` : ''
                  }`
                : parsed.error}
        </p>
      </form>

      <section aria-label={`Sets on ${formatDay(date)}`} className="day">
        <h2 className="pixel small muted">{date === today() ? 'TODAY' : formatDay(date).toUpperCase()}</h2>
        {daySets.length === 0 ? (
          <p className="empty">Nothing logged yet.</p>
        ) : (
          [...byExercise].map(([exercise, list]) => (
            <ExerciseCard key={exercise} exercise={exercise} sets={list} info={info.get(exercise)} prIds={prIds} onEdit={onEdit} />
          ))
        )}
      </section>
    </div>
  );
}

function preview(s: Omit<NewSet, 'date'>): string {
  const parts = [];
  if (s.weight) parts.push(`${s.weight} kg${s.notes.includes('per hand') ? '/hand' : ''}`);
  if (s.durationSec) parts.push(`${s.durationSec} s`);
  if (s.reps) parts.push(`× ${s.reps}${s.extraReps ? ` +${s.extraReps}` : ''}`);
  if (!s.weight && !s.durationSec) parts.unshift('bodyweight');
  if (s.side) parts.push(s.side === 'L' ? 'left' : 'right');
  if (s.rpe) parts.push(`RPE ${s.rpe}`);
  return parts.join(' ');
}

function heroFor(pr: WorkoutSet | undefined, count: number, lastWorkout: string, date: string): { mood: GoblinMood; title: string; body: string } {
  if (pr) return { mood: 'cheer', title: 'NEW PR!', body: `${pr.exercise} ${setLabel(pr)}. The goblin is impressed.` };
  if (count > 0) return { mood: 'idle', title: `${count} SET${count === 1 ? '' : 'S'}`, body: 'Keep going. Records give +50 XP.' };
  if (date !== today()) return { mood: 'idle', title: 'REST DAY?', body: `Nothing on ${formatDay(date)}.` };
  if (lastWorkout && lastWorkout < addDays(today(), -4)) {
    return { mood: 'sleepy', title: 'ZZZ…', body: `Last workout: ${formatDay(lastWorkout)}. The goblin is getting bored.` };
  }
  return { mood: 'idle', title: 'READY?', body: 'Log your first set. Every set is +10 XP.' };
}
