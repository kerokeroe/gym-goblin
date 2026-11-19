// App shell: header, the active screen, bottom navigation, and the overlays
// (edit sheet, record celebration). Data lives in useGymData.
import { useCallback, useEffect, useState } from 'react';
import type { ExerciseInfo, NewSet, WorkoutSet } from './types.ts';
import { api } from './api.ts';
import { useGymData } from './useGymData.ts';
import { findPRs, setLabel, toInfoMap, XP_PER_PR, XP_PER_SET } from './lib/stats.ts';
import { LogScreen } from './screens/LogScreen.tsx';
import { HistoryScreen } from './screens/HistoryScreen.tsx';
import { GainsScreen } from './screens/GainsScreen.tsx';
import { LairScreen } from './screens/LairScreen.tsx';
import { EditSheet } from './components/EditSheet.tsx';
import { Celebration, type CelebrationInfo } from './components/Celebration.tsx';
import { Goblin } from './components/Goblin.tsx';

const TABS = [
  { id: 'log', label: 'LOG' },
  { id: 'history', label: 'HISTORY' },
  { id: 'gains', label: 'GAINS' },
  { id: 'lair', label: 'LAIR' },
] as const;
type Tab = (typeof TABS)[number]['id'];

// The tab lives in the URL hash (#gains/hip%20thrust) so refresh and the back button work.
function readHash(): { tab: Tab; exercise: string | null } {
  const [tab, exercise] = window.location.hash.slice(1).split('/');
  const known = TABS.some((t) => t.id === tab);
  return { tab: known ? (tab as Tab) : 'log', exercise: exercise ? decodeURIComponent(exercise) : null };
}

export default function App() {
  const { data, status, reload } = useGymData();
  const [route, setRoute] = useState(readHash);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);
  const [celebration, setCelebration] = useState<CelebrationInfo | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (tab: Tab, exercise: string | null = null) => {
    window.location.hash = exercise ? `${tab}/${encodeURIComponent(exercise)}` : tab;
    window.scrollTo(0, 0);
  };

  async function logSet(set: NewSet) {
    if (!data.info.has(set.exercise)) await api.addExercise({ name: set.exercise });
    const { id } = await api.addSet(set);
    const fresh = await reload();
    if (!fresh) return;
    const saved = fresh.sets.find((s) => s.id === id);
    if (saved && findPRs(fresh.sets, toInfoMap(fresh.exercises)).has(id)) {
      setCelebration({ exercise: saved.exercise, label: setLabel(saved), xp: XP_PER_PR + XP_PER_SET });
    }
  }

  async function saveSet(id: number, set: NewSet) {
    if (!data.info.has(set.exercise)) await api.addExercise({ name: set.exercise });
    await api.updateSet(id, set);
    await reload();
  }

  async function deleteSet(id: number) {
    await api.deleteSet(id);
    await reload();
  }

  async function updateExercise(name: string, patch: Partial<Omit<ExerciseInfo, 'name'>>) {
    await api.updateExercise(name, patch);
    await reload();
  }

  const closeCelebration = useCallback(() => setCelebration(null), []);
  const closeEditor = useCallback(() => setEditing(null), []);

  return (
    <div className="app">
      <header className="topbar">
        <a href="#log" className="logo pixel">
          GYM GOBLIN
        </a>
        <span className="streak pixel" title="Weeks in a row with at least one workout">
          <svg width="12" height="14" viewBox="0 0 7 8" aria-hidden="true" shapeRendering="crispEdges">
            <rect x="3" y="0" width="1" height="2" fill="#FF4FD8" />
            <rect x="2" y="2" width="3" height="2" fill="#FF4FD8" />
            <rect x="1" y="4" width="5" height="3" fill="#FF4FD8" />
            <rect x="3" y="5" width="1" height="2" fill="#FFE14D" />
            <rect x="2" y="7" width="3" height="1" fill="#FF4FD8" />
          </svg>
          {data.streak} WK STREAK
        </span>
      </header>

      <main>
        {status === 'loading' && <p className="empty pixel">LOADING…</p>}
        {status === 'error' && (
          <div className="empty">
            <Goblin mood="sleepy" size={96} />
            <p>Can't reach the API. Is the server running (`npm run server`)?</p>
            <button type="button" className="btn btn-primary" onClick={reload}>
              Try again
            </button>
          </div>
        )}
        {status === 'ready' && route.tab === 'log' && <LogScreen data={data} onLog={logSet} onEdit={setEditing} />}
        {status === 'ready' && route.tab === 'history' && <HistoryScreen data={data} onEdit={setEditing} />}
        {status === 'ready' && route.tab === 'gains' && (
          <GainsScreen
            data={data}
            selected={route.exercise}
            onSelect={(name) => go('gains', name)}
            onEdit={setEditing}
            onUpdateExercise={updateExercise}
          />
        )}
        {status === 'ready' && route.tab === 'lair' && <LairScreen data={data} />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="pixel" aria-current={route.tab === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>

      {editing && (
        <EditSheet
          set={editing}
          exerciseNames={data.exercises.map((e) => e.name)}
          onSave={saveSet}
          onDelete={deleteSet}
          onClose={closeEditor}
        />
      )}
      {celebration && <Celebration info={celebration} onClose={closeCelebration} />}
    </div>
  );
}
