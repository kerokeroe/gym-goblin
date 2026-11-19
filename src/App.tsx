import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const COLORS = {
  accent: '#c4613a',
  purple: '#7c6bc4',
  text: '#1a1a18',
  secondary: '#6b6358',
  grid: 'rgba(0, 0, 0, 0.06)'
};

function epley1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

const prMarkerPlugin = {
  id: 'prMarker',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      const prFlags = dataset?.prFlags as boolean[] | undefined;
      if (!prFlags) return;
      const meta = chart.getDatasetMeta(datasetIndex);
      ctx.save();
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      meta.data.forEach((point: any, index: number) => {
        if (!prFlags[index]) return;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.accent;
        ctx.fill();
        ctx.fillText('PR', point.x, point.y - 10);
      });
      ctx.restore();
    });
  }
};

type Workout = {
  id: number;
  date: string;
  exercise: string;
  reps: number;
  weight: number;
  rpe: number | null;
  extraReps: number;
  notes: string;
  side: string;
  durationSec?: number | null;
};

type ExerciseSummary = {
  exercise: string;
  sessions: number;
  lastDate: string;
  isUnilateral: boolean;
  muscleGroup: string;
  isAssisted: boolean;
};

type ExerciseName = {
  name: string;
  isUnilateral: boolean;
  muscleGroup: string;
  isAssisted: boolean;
};

const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'] as const;

const tabs = ['Log Workout', 'Calendar', 'Exercises', 'Muscle Groups'] as const;

type Tab = (typeof tabs)[number];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Log Workout');
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exerciseList, setExerciseList] = useState<ExerciseSummary[]>([]);
  const [exerciseNames, setExerciseNames] = useState<ExerciseName[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [progression, setProgression] = useState<Workout[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseUnilateral, setNewExerciseUnilateral] = useState(false);
  const [newExerciseAssisted, setNewExerciseAssisted] = useState(false);
  const [newExerciseMuscleGroup, setNewExerciseMuscleGroup] = useState('');
  const [muscleWeekOffset, setMuscleWeekOffset] = useState(0);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    exercise: '',
    reps: 8,
    weight: 45,
    rpe: 7,
    extraReps: 0,
    notes: '',
    side: ''
  });
  const [message, setMessage] = useState('');
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [editForm, setEditForm] = useState<Partial<Workout> | null>(null);

  const groupedByDate = useMemo(() => {
    return workouts.reduce<Record<string, Workout[]>>((acc, workout) => {
      acc[workout.date] = acc[workout.date] || [];
      acc[workout.date].push(workout);
      return acc;
    }, {});
  }, [workouts]);

  const timelineData = useMemo(() => {
    const daily: Record<string, { date: string; maxWeight: number; totalReps: number; maxRpe: number; extraReps: number; e1rm: number }> = {};
    progression.forEach((entry) => {
      const e1rm = epley1RM(entry.weight, entry.reps);
      if (!daily[entry.date]) {
        daily[entry.date] = {
          date: entry.date,
          maxWeight: entry.weight,
          totalReps: entry.reps,
          maxRpe: entry.rpe ?? 0,
          extraReps: entry.extraReps,
          e1rm
        };
      } else {
        daily[entry.date].maxWeight = Math.max(daily[entry.date].maxWeight, entry.weight);
        daily[entry.date].totalReps += entry.reps;
        daily[entry.date].maxRpe = Math.max(daily[entry.date].maxRpe, entry.rpe ?? 0);
        daily[entry.date].extraReps = Math.max(daily[entry.date].extraReps, entry.extraReps);
        daily[entry.date].e1rm = Math.max(daily[entry.date].e1rm, e1rm);
      }
    });
    return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
  }, [progression]);

  const monthOverMonth = useMemo(() => {
    const isAssisted = selectedExercise ? (exerciseNames.find(e => e.name === selectedExercise)?.isAssisted ?? false) : false;

    function monthStats(monthKey: string) {
      const entries = progression.filter((e) => e.date.slice(0, 7) === monthKey);
      const totalVolume = entries.reduce((sum, e) => sum + e.reps * e.weight, 0);
      const bestE1rm = entries.length ? Math.max(...entries.map((e) => epley1RM(e.weight, e.reps))) : 0;
      const lowestWeight = entries.length ? Math.min(...entries.map((e) => e.weight)) : 0;
      const sessions = new Set(entries.map((e) => e.date)).size;
      return { totalVolume, bestE1rm, lowestWeight, sessions };
    }
    function compare(curr: number, prev: number): { dir: 'up' | 'down' | 'flat'; pct: number | null } {
      if (prev === 0 && curr === 0) return { dir: 'flat', pct: 0 };
      if (prev === 0) return { dir: 'up', pct: null };
      const rounded = Math.round(((curr - prev) / prev) * 100);
      if (rounded === 0) return { dir: 'flat', pct: 0 };
      return { dir: rounded > 0 ? 'up' : 'down', pct: Math.abs(rounded) };
    }

    const now = new Date();
    const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthKey = `${thisMonthDate.getFullYear()}-${String(thisMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = monthStats(thisMonthKey);
    const lastMonth = monthStats(lastMonthKey);

    return {
      thisMonthLabel: thisMonthDate.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
      lastMonthLabel: lastMonthDate.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
      thisMonth,
      lastMonth,
      isAssisted,
      hasEnoughData: thisMonth.sessions >= 2,
      volumeChange: compare(thisMonth.totalVolume, lastMonth.totalVolume),
      e1rmChange: isAssisted
        ? compare(thisMonth.lowestWeight, lastMonth.lowestWeight)
        : compare(thisMonth.bestE1rm, lastMonth.bestE1rm),
      sessionsChange: compare(thisMonth.sessions, lastMonth.sessions)
    };
  }, [progression, exerciseNames, selectedExercise]);

  const groupedProgression = useMemo(() => {
    return Object.entries(
      progression.reduce<Record<string, Workout[]>>((acc, entry) => {
        acc[entry.date] = acc[entry.date] || [];
        acc[entry.date].push(entry);
        return acc;
      }, {})
    ).sort(([a], [b]) => a.localeCompare(b));
  }, [progression]);

  const exerciseSummary = useMemo(() => {
    const totalSessions = progression.length;
    const totalVolume = progression.reduce((sum, entry) => sum + entry.reps * entry.weight, 0);
    const averageWeight = progression.length ? Math.round(progression.reduce((sum, entry) => sum + entry.weight, 0) / progression.length) : 0;
    const maxWeight = progression.length ? Math.max(...progression.map((entry) => entry.weight)) : 0;
    const lastSession = progression.length ? progression[progression.length - 1].date : '';
    return { totalSessions, totalVolume, averageWeight, maxWeight, lastSession };
  }, [progression]);

  const chartData = useMemo(() => {
    const isAssisted = selectedExercise ? (exerciseNames.find(e => e.name === selectedExercise)?.isAssisted ?? false) : false;

    const weightPrFlags: boolean[] | undefined = isAssisted ? (() => {
      let runningMin = Infinity;
      return timelineData.map((d) => {
        const isNewBest = d.maxWeight < runningMin;
        if (isNewBest) runningMin = d.maxWeight;
        return isNewBest;
      });
    })() : undefined;

    const e1rmPrFlags: boolean[] | undefined = !isAssisted ? (() => {
      let runningMax = -Infinity;
      return timelineData.map((d) => {
        const isNewBest = d.e1rm > runningMax;
        if (isNewBest) runningMax = d.e1rm;
        return isNewBest;
      });
    })() : undefined;

    return {
      labels: timelineData.map((d) => new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
      datasets: [
        {
          label: 'Weight',
          data: timelineData.map((d) => d.maxWeight),
          borderColor: COLORS.accent,
          backgroundColor: 'rgba(196, 97, 58, 0.1)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: COLORS.accent,
          pointBorderColor: '#fbf7f0',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          ...(weightPrFlags ? { prFlags: weightPrFlags } : {})
        },
        {
          label: 'Est. 1RM',
          data: timelineData.map((d) => Math.round(d.e1rm * 10) / 10),
          borderColor: COLORS.purple,
          backgroundColor: 'rgba(124, 107, 196, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          pointBackgroundColor: COLORS.purple,
          pointBorderColor: '#fbf7f0',
          pointBorderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          ...(e1rmPrFlags ? { prFlags: e1rmPrFlags } : {})
        }
      ]
    };
  }, [timelineData, exerciseNames, selectedExercise]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.text,
        padding: 10,
        cornerRadius: 4,
        displayColors: true,
        titleFont: { family: 'Inter, sans-serif', size: 12 },
        bodyFont: { family: 'Inter, sans-serif', size: 13, weight: 'bold' as const },
        callbacks: {
          title: (items: any[]) => {
            const d = timelineData[items[0].dataIndex];
            return d ? new Date(d.date).toLocaleDateString() : '';
          },
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y} kg`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: COLORS.secondary, font: { family: 'Inter, sans-serif', size: 11 } }
      },
      y: {
        grid: { color: COLORS.grid },
        border: { display: false },
        ticks: { color: COLORS.secondary, font: { family: 'Inter, sans-serif', size: 11 } }
      }
    }
  }), [timelineData]);

  const getRpeClass = (rpe: number) => {
    if (rpe <= 7) return 'rpe-pill green';
    if (rpe === 8) return 'rpe-pill amber';
    return 'rpe-pill red';
  };

  const getFatigueClass = (pct: number) => {
    if (pct > 40) return 'fatigue-value red';
    if (pct >= 20) return 'fatigue-value amber';
    return 'fatigue-value green';
  };

  function renderChange(change: { dir: 'up' | 'down' | 'flat'; pct: number | null }, goodWhenUp = true) {
    if (change.dir === 'flat') return <span className="momo-change flat">— 0%</span>;
    const isGood = goodWhenUp ? change.dir === 'up' : change.dir === 'down';
    if (change.dir === 'up') {
      return <span className={`momo-change ${isGood ? 'good' : 'bad'}`}>↑ {change.pct === null ? 'new' : `${change.pct}%`}</span>;
    }
    return <span className={`momo-change ${isGood ? 'good' : 'bad'}`}>↓ {change.pct}%</span>;
  }

  const isUnilateralExercise = (name: string) =>
    exerciseNames.find((e) => e.name === name)?.isUnilateral ?? false;

  const isAssistedExercise = (name: string) =>
    exerciseNames.find((e) => e.name === name)?.isAssisted ?? false;

  const muscleWeekData = useMemo(() => {
    const monday = addDays(getWeekStart(new Date()), muscleWeekOffset * 7);
    const sunday = addDays(monday, 6);
    const startKey = formatYMD(monday);
    const endKey = formatYMD(sunday);
    const groupLookup = new Map(exerciseNames.map((e) => [e.name, e.muscleGroup || 'Unassigned']));
    const counts: Record<string, number> = {};
    workouts.forEach((w) => {
      if (w.date < startKey || w.date > endKey) return;
      const group = groupLookup.get(w.exercise) || 'Unassigned';
      counts[group] = (counts[group] || 0) + 1;
    });
    const rows = MUSCLE_GROUPS.map((g) => ({ group: g as string, sets: counts[g] || 0 }));
    if (counts['Unassigned']) rows.push({ group: 'Unassigned', sets: counts['Unassigned'] });
    rows.sort((a, b) => b.sets - a.sets);
    const maxSets = Math.max(1, ...rows.map((r) => r.sets));
    return { monday, sunday, rows, maxSets };
  }, [workouts, exerciseNames, muscleWeekOffset]);

  // Mini-calendar state and helpers
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() } as { year: number; month: number };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function formatYMD(date: Date) {
    // Use local date to avoid UTC timezone offset
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function prevMonth() {
    setCalendarCursor((c) => {
      const m = c.month - 1;
      if (m < 0) return { year: c.year - 1, month: 11 };
      return { year: c.year, month: m };
    });
  }

  function nextMonth() {
    setCalendarCursor((c) => {
      const m = c.month + 1;
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
  }

  function renderMiniCalendar(workoutDates: string[]) {
    const { year, month } = calendarCursor;
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // compute volume per day for heatmap
    const volumes: Record<string, number> = {};
    let maxVolume = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const key = formatYMD(dt);
      const list = (groupedByDate as Record<string, any[]>)[key] || [];
      const vol = list.reduce((s, e) => s + (e.reps || 0) * (e.weight || 0), 0);
      volumes[key] = vol;
      if (vol > maxVolume) maxVolume = vol;
    }

    const cells: JSX.Element[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const key = formatYMD(dt);
      const has = workoutDates.includes(key);
      const isSelected = selectedDate === key;
      const isToday = key === formatYMD(new Date());
      const vol = volumes[key] || 0;
      const bucket = maxVolume > 0 ? Math.ceil((vol / maxVolume) * 3) : (has ? 1 : 0);
      const heatClass = has ? ` heat-${bucket}` : '';
      cells.push(
        <button
          key={key}
          type="button"
          onClick={() => setSelectedDate(isSelected ? null : key)}
          className={"mini-day" + (has ? ' has-workout' : '') + (isSelected ? ' selected' : '') + heatClass + (isToday ? ' today' : '')}
        >
          <div className="mini-day-num">{d}</div>
        </button>
      );
    }

    // day-of-week headers
    const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return (
      <div>
        <div className="mini-calendar-header">
          <button type="button" className="tab" onClick={prevMonth}>◀</button>
          <div className="mini-calendar-title">{first.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
          <button type="button" className="tab" onClick={nextMonth}>▶</button>
        </div>
        <div className="mini-weekdays">
          {weekdays.map((w, i) => (
            <div key={i} className="mini-weekday">{w}</div>
          ))}
        </div>
        <div className="mini-grid">{cells}</div>
      </div>
    );
  }

  useEffect(() => {
    fetchWorkouts();
    fetchExerciseList();
    fetchExerciseNames();
  }, []);

  function fetchExerciseNames() {
    fetch('/api/exercises/names')
      .then((res) => res.json())
      .then(setExerciseNames)
      .catch(() => setExerciseNames([]));
  }

  function addExercise() {
    const name = newExerciseName.trim();
    if (!name) return;
    fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isUnilateral: newExerciseUnilateral, muscleGroup: newExerciseMuscleGroup, isAssisted: newExerciseAssisted })
    })
      .then((res) => res.json())
      .then(() => {
        setNewExerciseName('');
        setNewExerciseUnilateral(false);
        setNewExerciseMuscleGroup('');
        setNewExerciseAssisted(false);
        fetchExerciseNames();
        fetchExerciseList();
      })
      .catch(() => {});
  }

  function toggleUnilateral(name: string, value: boolean) {
    fetch(`/api/exercises/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isUnilateral: value })
    })
      .then((res) => res.json())
      .then(() => {
        fetchExerciseList();
        fetchExerciseNames();
      })
      .catch(() => {});
  }

  function toggleAssisted(name: string, value: boolean) {
    fetch(`/api/exercises/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAssisted: value })
    })
      .then((res) => res.json())
      .then(() => {
        fetchExerciseList();
        fetchExerciseNames();
      })
      .catch(() => {});
  }

  function updateMuscleGroup(name: string, muscleGroup: string) {
    fetch(`/api/exercises/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muscleGroup })
    })
      .then((res) => res.json())
      .then(() => {
        fetchExerciseList();
        fetchExerciseNames();
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (selectedExercise) {
      fetch(`/api/exercises/${encodeURIComponent(selectedExercise)}/progression`)
        .then((res) => res.json())
        .then(setProgression)
        .catch(() => setProgression([]));
    }
  }, [selectedExercise]);

  function fetchWorkouts() {
    fetch('/api/workouts')
      .then((res) => res.json())
      .then(setWorkouts)
      .catch(() => setWorkouts([]));
  }

  function fetchExerciseList() {
    fetch('/api/exercises')
      .then((res) => res.json())
      .then(setExerciseList)
      .catch(() => setExerciseList([]));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isUnilateralExercise(form.exercise) && !form.side) {
      setMessage('Please choose a side (left or right).');
      return;
    }
    fetch('/api/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
      .then((res) => {
        if (!res.ok) return res.json().then((data) => Promise.reject(data));
        return res.json();
      })
      .then(() => {
        setMessage('Workout saved!');
        fetchWorkouts();
        fetchExerciseList();
        setForm((current) => ({ ...current, exercise: '', notes: '', side: '' }));
        setTimeout(() => setMessage(''), 2500);
      })
      .catch((error) => {
        const text = typeof error === 'object' && error !== null && 'error' in error ? (error as any).error : 'Could not save workout.';
        setMessage(String(text));
      });
  }

  function deleteWorkout(id: number) {
    if (!confirm('Delete this workout?')) return;
    fetch(`/api/workouts/${id}`, { method: 'DELETE' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to delete');
        return res.json();
      })
      .then(() => {
        setMessage('Workout deleted.');
        fetchWorkouts();
        fetchExerciseList();
        setTimeout(() => setMessage(''), 2500);
      })
      .catch(() => setMessage('Could not delete workout.'));
  }

  function startEdit(workout: Workout) {
    setEditingWorkout(workout);
    setEditForm({ ...workout });
  }

  function saveEdit() {
    if (!editingWorkout || !editForm) return;
    const { date, exercise, reps, weight, rpe, extraReps, notes, side, durationSec } = editForm;
    if (!date || !exercise || reps == null || weight == null || extraReps == null) {
      setMessage('Missing required fields.');
      return;
    }
    if (isUnilateralExercise(exercise) && !side) {
      setMessage('Please choose a side (left or right).');
      return;
    }
    fetch(`/api/workouts/${editingWorkout.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, exercise, reps, weight, rpe: rpe ?? null, extraReps, notes, side: side || '', durationSec: durationSec ?? null })
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to update');
        return res.json();
      })
      .then(() => {
        setMessage('Workout updated.');
        fetchWorkouts();
        fetchExerciseList();
        setEditingWorkout(null);
        setEditForm(null);
        setTimeout(() => setMessage(''), 2500);
      })
      .catch(() => setMessage('Could not update workout.'));
  }


  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="logo">Gym Buddy</div>
        <p className="subtext">A plain-spoken log of workouts, calendar history, and progress.</p>
      </header>

      <nav className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="panel">
        {activeTab === 'Log Workout' && (
          <section>
            <h2>Log workout</h2>
            <form className="form-grid log-form-card" onSubmit={handleSubmit}>
              <label className="span-1">
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label className="span-3">
                Exercise
                <select
                  value={form.exercise}
                  onChange={(e) => {
                    const exercise = e.target.value;
                    setForm((f) => ({ ...f, exercise, side: isUnilateralExercise(exercise) ? f.side : '' }));
                  }}
                  required
                >
                  <option value="">-- choose exercise --</option>
                  {exerciseNames.map((ex) => (
                    <option key={ex.name} value={ex.name}>{ex.name}</option>
                  ))}
                </select>
              </label>
              {isUnilateralExercise(form.exercise) && (
                <label>
                  Side
                  <select
                    value={form.side}
                    onChange={(e) => setForm({ ...form, side: e.target.value })}
                    required
                  >
                    <option value="">-- choose side --</option>
                    <option value="L">Left</option>
                    <option value="R">Right</option>
                  </select>
                </label>
              )}
              <label>
                Reps
                <input
                  type="number"
                  min="1"
                  value={form.reps}
                  onChange={(e) => setForm({ ...form, reps: Number(e.target.value) })}
                />
              </label>
              <label>
                Weight (kg)
                <input
                  type="number"
                  min="0"
                  value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                />
              </label>
              <label>
                RPE /10
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={form.rpe}
                  onChange={(e) => setForm({ ...form, rpe: Number(e.target.value) })}
                />
                <span className="hint-text">Rate of perceived exertion (1–10)</span>
              </label>
              <label>
                Extra reps
                <input
                  type="number"
                  min="0"
                  value={form.extraReps}
                  onChange={(e) => setForm({ ...form, extraReps: Number(e.target.value) })}
                />
              </label>
              <label className="full-width">
                Notes
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional finish-off notes"
                />
              </label>
              <button type="submit" className="submit-button save-button">
                Save workout
              </button>
            </form>
            <p className="status-text">{message}</p>
          </section>
        )}

        {activeTab === 'Calendar' && (
          <section>
            <h2>Calendar history</h2>
            {Object.keys(groupedByDate).length === 0 ? (
              <p className="empty-state">No workouts yet. Add one in the Log tab.</p>
            ) : (
              <div className="calendar-grid">
                {/* Mini month grid for quick navigation */}
                <div className="mini-calendar full-width">
                  {renderMiniCalendar(Object.keys(groupedByDate))}
                </div>

                {Object.entries(groupedByDate)
                  .sort(([a], [b]) => (a > b ? -1 : 1))
                  .map(([date, entries]) => {
                    // skip days not in the current mini-calendar month when a date is selected
                    const uniqueExercises = Array.from(new Set(entries.map((e) => e.exercise)));
                    const grouped = entries.reduce<Record<string, typeof entries>>((acc, e) => {
                      acc[e.exercise] = acc[e.exercise] || [];
                      acc[e.exercise].push(e);
                      return acc;
                    }, {} as Record<string, typeof entries>);
                    return (
                      <article key={date} className={"calendar-card" + (selectedDate === date ? ' selected-card' : '')}>
                        <div className="card-header">
                          <span>{new Date(date).toLocaleDateString()}</span>
                          <span>{entries.length} sets • {uniqueExercises.length} exercise{uniqueExercises.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="card-body">
                          {uniqueExercises.map((exercise) => (
                            <div key={exercise} className="exercise-group">
                              <div className="exercise-group-title"><strong>{exercise}</strong></div>
                              {grouped[exercise].map((workout, idx) => (
                                <div key={`${workout.id}-${idx}`} className="calendar-row">
                                  <div className="calendar-left">
                                    {workout.side && (
                                      <span className={'side-tag ' + (workout.side === 'L' ? 'side-l' : 'side-r')}>
                                        {workout.side}
                                      </span>
                                    )}
                                    {workout.reps} reps @ {workout.weight} kg{workout.extraReps > 0 ? ` +${workout.extraReps}` : ''}
                                  </div>
                                  <div className="calendar-right">
                                    {workout.rpe != null && <span className={getRpeClass(workout.rpe)}>RPE {workout.rpe}</span>}
                                    <button
                                      type="button"
                                      className="workout-btn edit-btn"
                                      onClick={() => startEdit(workout)}
                                      title="Edit"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      type="button"
                                      className="workout-btn delete-btn"
                                      onClick={() => deleteWorkout(workout.id)}
                                      title="Delete"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {grouped[exercise].some((w) => w.notes) && (
                                <div className="notes">
                                  {grouped[exercise].filter((w) => w.notes).map((w) => (
                                    <div key={`note-${w.id}`} style={{ marginTop: 6 }}>{w.notes}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'Exercises' && (
          <section>
            <h2>Exercise library</h2>
            <div className="exercise-layout">
              {!selectedExercise ? (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                    <input
                      placeholder="Add new exercise to library"
                      value={newExerciseName}
                      onChange={(e) => setNewExerciseName(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 10 }}
                    />
                    <select
                      className="muscle-group-select"
                      value={newExerciseMuscleGroup}
                      onChange={(e) => setNewExerciseMuscleGroup(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {MUSCLE_GROUPS.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <label className="unilateral-toggle">
                      <input
                        type="checkbox"
                        checked={newExerciseUnilateral}
                        onChange={(e) => setNewExerciseUnilateral(e.target.checked)}
                      />
                      Unilateral
                    </label>
                    <label className="unilateral-toggle">
                      <input
                        type="checkbox"
                        checked={newExerciseAssisted}
                        onChange={(e) => setNewExerciseAssisted(e.target.checked)}
                      />
                      Assisted
                    </label>
                    <button type="button" onClick={addExercise} className="submit-button" style={{ padding: '8px 12px' }}>
                      Add
                    </button>
                  </div>
                  <div className="exercise-list">
                    {exerciseList.length === 0 ? (
                      <p className="empty-state">No exercises logged yet.</p>
                    ) : (
                      exerciseList.map((exercise) => (
                        <div key={exercise.exercise} className="exercise-item-row">
                          <button
                            className="exercise-item"
                            onClick={() => setSelectedExercise(exercise.exercise)}
                          >
                            <div>{exercise.exercise}</div>
                            <small>{exercise.sessions} sessions • last {new Date(exercise.lastDate).toLocaleDateString()}</small>
                          </button>
                          <select
                            className="muscle-group-select"
                            value={exercise.muscleGroup || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateMuscleGroup(exercise.exercise, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {MUSCLE_GROUPS.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          <label className="unilateral-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={exercise.isUnilateral}
                              onChange={(e) => toggleUnilateral(exercise.exercise, e.target.checked)}
                            />
                            Unilateral
                          </label>
                          <label className="unilateral-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={exercise.isAssisted}
                              onChange={(e) => toggleAssisted(exercise.exercise, e.target.checked)}
                            />
                            Assisted
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="exercise-detail">
                  <button className="tab" onClick={() => setSelectedExercise(null)} style={{ marginBottom: 12 }}>
                    ← Back to list
                  </button>
                  <h3>{selectedExercise} progress</h3>
                  {progression.length === 0 ? (
                    <p className="empty-state">No history found for this exercise yet.</p>
                  ) : (
                    <>
                      <div className="exercise-detail-grid">
                        <div className="exercise-detail-panel">
                          <div className="line-chart-card">
                            <div className="line-chart-header">
                              <div>Weight trend</div>
                              <div>{timelineData.length} session{timelineData.length === 1 ? '' : 's'}</div>
                            </div>
                            <div className="line-chart-canvas-wrap">
                              <Line data={chartData} options={chartOptions} plugins={[prMarkerPlugin]} />
                            </div>
                            <div className="chart-legend">
                              <span className="chart-legend-item">
                                <span className="chart-legend-dot" style={{ background: COLORS.accent }} />
                                Weight
                              </span>
                              <span className="chart-legend-item">
                                <span className="chart-legend-dot" style={{ background: COLORS.purple }} />
                                Est. 1RM
                              </span>
                            </div>
                          </div>
                          <div className="summary-card momo-card">
                            <h4>Month over month</h4>
                            {monthOverMonth.hasEnoughData ? (
                              <div className="momo-columns">
                                <div className="momo-column">
                                  <div className="momo-month-label">{monthOverMonth.lastMonthLabel}</div>
                                  <div className="momo-metric">
                                    <span>Total volume</span>
                                    <strong>{Math.round(monthOverMonth.lastMonth.totalVolume).toLocaleString()} kg</strong>
                                  </div>
                                  <div className="momo-metric">
                                    <span>{monthOverMonth.isAssisted ? 'Lowest weight' : 'Best e1RM'}</span>
                                    <strong>{Math.round(monthOverMonth.isAssisted ? monthOverMonth.lastMonth.lowestWeight : monthOverMonth.lastMonth.bestE1rm).toLocaleString()} kg</strong>
                                  </div>
                                  <div className="momo-metric">
                                    <span>Sessions</span>
                                    <strong>{monthOverMonth.lastMonth.sessions}</strong>
                                  </div>
                                </div>
                                <div className="momo-column">
                                  <div className="momo-month-label">{monthOverMonth.thisMonthLabel}</div>
                                  <div className="momo-metric">
                                    <span>Total volume</span>
                                    <span className="momo-value-group">
                                      <strong>{Math.round(monthOverMonth.thisMonth.totalVolume).toLocaleString()} kg</strong>
                                      {renderChange(monthOverMonth.volumeChange)}
                                    </span>
                                  </div>
                                  <div className="momo-metric">
                                    <span>{monthOverMonth.isAssisted ? 'Lowest weight' : 'Best e1RM'}</span>
                                    <span className="momo-value-group">
                                      <strong>{Math.round(monthOverMonth.isAssisted ? monthOverMonth.thisMonth.lowestWeight : monthOverMonth.thisMonth.bestE1rm).toLocaleString()} kg</strong>
                                      {renderChange(monthOverMonth.e1rmChange, !monthOverMonth.isAssisted)}
                                    </span>
                                  </div>
                                  <div className="momo-metric">
                                    <span>Sessions</span>
                                    <span className="momo-value-group">
                                      <strong>{monthOverMonth.thisMonth.sessions}</strong>
                                      {renderChange(monthOverMonth.sessionsChange)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="empty-state">Not enough data yet for this month.</p>
                            )}
                          </div>
                        </div>
                        <div className="exercise-summary-panel">
                          <div className="summary-card">
                            <h4>Selected exercise stats</h4>
                            <div className="summary-row">
                              <span>Total sets</span>
                              <strong>{exerciseSummary.totalSessions}</strong>
                            </div>
                            <div className="summary-row">
                              <span>Total volume</span>
                              <strong>{exerciseSummary.totalVolume} kg</strong>
                            </div>
                            <div className="summary-row">
                              <span>Max weight</span>
                              <strong>{exerciseSummary.maxWeight} kg</strong>
                            </div>
                            <div className="summary-row">
                              <span>Average weight</span>
                              <strong>{exerciseSummary.averageWeight} kg</strong>
                            </div>
                            <div className="summary-row">
                              <span>Last session</span>
                              <strong>{exerciseSummary.lastSession ? new Date(exerciseSummary.lastSession).toLocaleDateString() : '—'}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="progress-list">
                        {groupedProgression.map(([date, entries]) => {
                          const totalVolume = entries.reduce((sum, entry) => sum + entry.reps * entry.weight, 0);
                          const fatigueIndex = entries.length > 1
                            ? Math.round(((entries[0].reps - entries[entries.length - 1].reps) / entries[0].reps) * 100)
                            : null;
                          return (
                            <div key={date} className="session-group">
                              <div className="session-group-header">
                                    <div>{new Date(date).toLocaleDateString()}</div>
                                    <div className="session-volume">Total volume: {totalVolume} kg</div>
                                  </div>
                              {entries.map((entry, index) => (
                                <div key={`${date}-${index}-${entry.weight}-${entry.reps}`} className="session-set">
                                  <span>Set {index + 1}</span>
                                  <span>
                                    {entry.side && (
                                      <span className={'side-tag ' + (entry.side === 'L' ? 'side-l' : 'side-r')}>
                                        {entry.side}
                                      </span>
                                    )}
                                    {entry.reps} reps @ {entry.weight} kg{entry.extraReps > 0 ? ` +${entry.extraReps} extra` : ''}
                                  </span>
                                  {entry.rpe != null && <span className={getRpeClass(entry.rpe)}>RPE {entry.rpe}</span>}
                                </div>
                              ))}
                              {fatigueIndex !== null && (
                                <div className="fatigue-line">
                                  Fatigue drop: <span className={getFatigueClass(fatigueIndex)}>{fatigueIndex}%</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'Muscle Groups' && (
          <section>
            <h2>Weekly sets per muscle group</h2>
            <div className="mini-calendar-header">
              <button type="button" className="tab" onClick={() => setMuscleWeekOffset((o) => o - 1)}>◀</button>
              <div className="mini-calendar-title">
                {muscleWeekData.monday.toLocaleDateString()} – {muscleWeekData.sunday.toLocaleDateString()}
                {muscleWeekOffset !== 0 && (
                  <button
                    type="button"
                    className="tab"
                    style={{ marginLeft: 12, padding: '4px 10px' }}
                    onClick={() => setMuscleWeekOffset(0)}
                  >
                    This week
                  </button>
                )}
              </div>
              <button type="button" className="tab" onClick={() => setMuscleWeekOffset((o) => o + 1)}>▶</button>
            </div>
            <div className="timeline-card">
              {muscleWeekData.rows.map((row) => (
                <div className="timeline-row" key={row.group}>
                  <div className="timeline-label">{row.group}</div>
                  <div className="timeline-bar-wrapper">
                    <div className="timeline-bar" style={{ width: `${(row.sets / muscleWeekData.maxSets) * 100}%` }} />
                  </div>
                  <div>{row.sets}</div>
                </div>
              ))}
            </div>
            {muscleWeekData.rows.every((r) => r.sets === 0) && (
              <p className="empty-state">No sets logged for this week yet.</p>
            )}
          </section>
        )}
      </main>

      {/* Edit Modal */}
      {editingWorkout && editForm && (
        <div className="modal-overlay" onClick={() => { setEditingWorkout(null); setEditForm(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Workout</h3>
            <form className="form-grid edit-form">
              <label className="span-1">
                Date
                <input
                  type="date"
                  value={editForm.date || ''}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                />
              </label>
              <label className="span-3">
                Exercise
                <select
                  value={editForm.exercise || ''}
                  onChange={(e) => {
                    const exercise = e.target.value;
                    setEditForm({ ...editForm, exercise, side: isUnilateralExercise(exercise) ? editForm.side : '' });
                  }}
                >
                  <option value="">-- choose exercise --</option>
                  {exerciseNames.map((ex) => (
                    <option key={ex.name} value={ex.name}>{ex.name}</option>
                  ))}
                </select>
              </label>
              {isUnilateralExercise(editForm.exercise || '') && (
                <label>
                  Side
                  <select
                    value={editForm.side || ''}
                    onChange={(e) => setEditForm({ ...editForm, side: e.target.value })}
                    required
                  >
                    <option value="">-- choose side --</option>
                    <option value="L">Left</option>
                    <option value="R">Right</option>
                  </select>
                </label>
              )}
              <label>
                Reps
                <input
                  type="number"
                  min="1"
                  value={editForm.reps || 0}
                  onChange={(e) => setEditForm({ ...editForm, reps: Number(e.target.value) })}
                />
              </label>
              <label>
                Weight (kg)
                <input
                  type="number"
                  min="0"
                  value={editForm.weight || 0}
                  onChange={(e) => setEditForm({ ...editForm, weight: Number(e.target.value) })}
                />
              </label>
              <label>
                RPE /10
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editForm.rpe || 0}
                  onChange={(e) => setEditForm({ ...editForm, rpe: Number(e.target.value) })}
                />
              </label>
              <label>
                Extra reps
                <input
                  type="number"
                  min="0"
                  value={editForm.extraReps || 0}
                  onChange={(e) => setEditForm({ ...editForm, extraReps: Number(e.target.value) })}
                />
              </label>
              <label className="full-width">
                Notes
                <textarea
                  rows={3}
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </label>
              <div className="modal-buttons">
                <button type="button" className="submit-button" onClick={saveEdit}>
                  Save Changes
                </button>
                <button
                  type="button"
                  className="submit-button"
                  onClick={() => { setEditingWorkout(null); setEditForm(null); }}
                  style={{ background: '#999' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
