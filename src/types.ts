export type Side = '' | 'L' | 'R';

/** One logged set, as the API returns it. */
export type WorkoutSet = {
  id: number;
  date: string; // YYYY-MM-DD
  exercise: string;
  reps: number;
  weight: number; // kg; per hand for dumbbell pairs; assistance for assisted exercises
  rpe: number | null;
  extraReps: number;
  notes: string;
  side: Side;
  durationSec: number | null;
  source?: string;
  createdAt?: string;
};

/** A set before it is saved. */
export type NewSet = Omit<WorkoutSet, 'id' | 'source' | 'createdAt'>;

export type ExerciseInfo = {
  name: string;
  isUnilateral: boolean;
  muscleGroup: string;
  isAssisted: boolean;
};

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
] as const;
