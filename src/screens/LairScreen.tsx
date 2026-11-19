import { useMemo, useState } from 'react';
import { MUSCLE_GROUPS } from '../types.ts';
import type { GymData } from '../useGymData.ts';
import { weeklyMuscleSets, XP_PER_PR, XP_PER_SET, xpForLevel } from '../lib/stats.ts';
import { addDays, formatDay, today, weekStart } from '../lib/dates.ts';
import { Goblin } from '../components/Goblin.tsx';

// Common hypertrophy guidance is roughly 10-20 hard sets per muscle per week.
const TARGET = 10;

export function LairScreen({ data }: { data: GymData }) {
  const { sets, info, prIds, level, xp, streak } = data;
  const [offset, setOffset] = useState(0);
  const monday = addDays(weekStart(today()), offset * 7);

  const rows = useMemo(() => {
    const counts = weeklyMuscleSets(sets, info, monday);
    const list: { group: string; count: number }[] = MUSCLE_GROUPS.map((g) => ({ group: g, count: counts.get(g) ?? 0 }));
    if (counts.get('Unassigned')) list.push({ group: 'Unassigned', count: counts.get('Unassigned')! });
    return list.sort((a, b) => b.count - a.count);
  }, [sets, info, monday]);
  const max = Math.max(TARGET, ...rows.map((r) => r.count));
  const days = new Set(sets.map((s) => s.date)).size;
  const nextTitleLevel = Math.floor((level.level - 1) / 4) * 4 + 5;

  return (
    <div className="screen">
      <section className="hero lair-hero">
        <Goblin mood={streak > 0 ? 'cheer' : 'sleepy'} size={112} />
        <div className="hero-text">
          <p className="pixel accent">LVL {level.level}</p>
          <p className="big-number">{level.title}</p>
          <p className="muted small">
            {xp.toLocaleString('en')} XP total · next title at level {nextTitleLevel} ({(xpForLevel(nextTitleLevel) - xp).toLocaleString('en')} XP to go)
          </p>
        </div>
      </section>

      <section className="stat-grid four" aria-label="Lifetime">
        <div className="stat">
          <span className="pixel small muted">SETS</span>
          <strong>{sets.length.toLocaleString('en')}</strong>
        </div>
        <div className="stat">
          <span className="pixel small muted">DAYS</span>
          <strong>{days}</strong>
        </div>
        <div className="stat">
          <span className="pixel small muted">PRS</span>
          <strong className="yellow">{prIds.size}</strong>
        </div>
        <div className="stat">
          <span className="pixel small muted">STREAK</span>
          <strong className="pink">{streak} wk</strong>
        </div>
      </section>

      <section className="panel" aria-label="Sets per muscle group">
        <div className="week-nav">
          <button type="button" className="btn btn-ghost" onClick={() => setOffset(offset - 1)} aria-label="Previous week">
            ◀
          </button>
          <h2 className="pixel small">
            {offset === 0 ? 'THIS WEEK' : `WEEK OF ${formatDay(monday).toUpperCase()}`}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Next week">
            ▶
          </button>
        </div>
        <ul className="bars">
          {rows.map((r) => (
            <li key={r.group}>
              <span className="bar-label">{r.group}</span>
              <span className="bar-track">
                <span className={`bar-fill ${r.count >= TARGET ? 'done' : ''}`} style={{ width: `${(r.count / max) * 100}%` }} />
                <span className="bar-target" style={{ left: `${(TARGET / max) * 100}%` }} aria-hidden="true" />
              </span>
              <span className="bar-count">{r.count}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Line = {TARGET} sets, a common weekly minimum for growth.</p>
      </section>

      <p className="muted small center">
        +{XP_PER_SET} XP per set · +{XP_PER_PR} XP per personal record
      </p>
    </div>
  );
}
