// Loads sets and exercises from the API and derives everything the screens
// share: records, XP, level and streak. Screens get one `data` object.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExerciseInfo, WorkoutSet } from './types.ts';
import { api } from './api.ts';
import { findPRs, levelFromXp, streakWeeks, toInfoMap, xpTotal, type InfoMap } from './lib/stats.ts';
import { today } from './lib/dates.ts';

export type GymData = {
  sets: WorkoutSet[];
  exercises: ExerciseInfo[];
  info: InfoMap;
  prIds: Set<number>;
  xp: number;
  level: ReturnType<typeof levelFromXp>;
  streak: number;
};

export function useGymData() {
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<ExerciseInfo[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  /** Re-fetch everything; resolves with the fresh sets so callers can inspect them. */
  const reload = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.sets(), api.exercises()]);
      setSets(s);
      setExercises(e);
      setStatus('ready');
      return { sets: s, exercises: e };
    } catch {
      setStatus('error');
      return null;
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const data = useMemo<GymData>(() => {
    const info = toInfoMap(exercises);
    const prIds = findPRs(sets, info);
    const xp = xpTotal(sets.length, prIds.size);
    return {
      sets,
      exercises,
      info,
      prIds,
      xp,
      level: levelFromXp(xp),
      streak: streakWeeks(sets.map((s) => s.date), today()),
    };
  }, [sets, exercises]);

  return { data, status, reload };
}
