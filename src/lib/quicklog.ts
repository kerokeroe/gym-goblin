// Parse one free-text set the way it is typed between sets at the gym:
//
//   hip thrust 90 11          -> 90 kg x 11
//   rdl 30kg x 8 rpe 8        -> 30 kg x 8, RPE 8
//   bulgarian 6+6 9 L         -> 6 kg per hand x 9, left side
//   assisted pull up 40 5+2   -> 40 kg x 5, +2 extra reps
//   cable row 50 lbs 12       -> 22.68 kg x 12
//   plank 45 sec / 1:30       -> timed set
//   push up 15                -> bodyweight x 15
//
// The exercise is matched against known names (exact, then prefix, then
// "every typed word appears"); an unknown name is allowed and flagged as new.
import type { NewSet, Side } from '../types.ts';

export type QuickLogResult =
  | { ok: true; set: Omit<NewSet, 'date'>; isNewExercise: boolean; candidates: string[] }
  | { ok: false; error: string };

const LBS_TO_KG = 0.45359237;
const round2 = (n: number) => Math.round(n * 100) / 100;

const SIDE_WORDS: Record<string, Side> = { l: 'L', left: 'L', r: 'R', right: 'R' };
const UNIT_WORDS = new Set(['kg', 'kgs', 'lb', 'lbs', 'sec', 'secs', 's', 'min', 'mins', 'x', 'reps', 'rep', 'rpe']);

/** Split "90kg", "30x8", "6+6" etc. into separate tokens. */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/(\d)(kg|kgs|lbs?|secs?|s|mins?)\b/g, '$1 $2')
    .replace(/(\d)\s*[x×*]\s*(\d)/g, '$1 x $2')
    .replace(/@\s*(\d)/g, 'rpe $1')
    .split(/\s+/)
    .filter(Boolean);
}

const isNumeric = (t: string) => /^\d+(\.\d+)?$/.test(t);
const isPlus = (t: string) => /^\d+(\.\d+)?\+\d+(\.\d+)?$/.test(t) || /^\+\d+$/.test(t);
const isClock = (t: string) => /^\d+:\d{2}$/.test(t);

export function matchExercise(typed: string, known: string[]): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const exact = known.filter((k) => k.toLowerCase() === q);
  if (exact.length) return exact;
  const prefix = known.filter((k) => k.toLowerCase().startsWith(q));
  if (prefix.length) return prefix;
  const words = q.split(/\s+/);
  return known.filter((k) => words.every((w) => k.toLowerCase().includes(w)));
}

export function parseQuickLog(input: string, knownExercises: string[]): QuickLogResult {
  const tokens = tokenize(input);
  const firstData = tokens.findIndex((t) => isNumeric(t) || isPlus(t) || isClock(t) || t === 'bw');
  if (firstData <= 0) {
    return { ok: false, error: firstData === 0 ? 'Start with the exercise name' : 'Add numbers, e.g. "hip thrust 90 10"' };
  }
  const typedName = tokens.slice(0, firstData).join(' ');
  const rest = tokens.slice(firstData);

  let side: Side = '';
  let rpe: number | null = null;
  let durationSec: number | null = null;
  let lbs = false;
  let perHand = false;
  const nums: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    const next = rest[i + 1];
    if (t in SIDE_WORDS) side = SIDE_WORDS[t];
    else if (t === 'rpe' && next && isNumeric(next)) rpe = Number(rest[++i]);
    else if (t === 'lb' || t === 'lbs') lbs = true;
    else if (t === 'bw') nums.push('0');
    else if (isClock(t)) {
      const [m, s] = t.split(':').map(Number);
      durationSec = m * 60 + s;
    } else if ((t === 'sec' || t === 'secs' || t === 's') && nums.length) {
      durationSec = (durationSec ?? 0) + Number(nums.pop());
    } else if ((t === 'min' || t === 'mins') && nums.length) {
      durationSec = (durationSec ?? 0) + Number(nums.pop()) * 60;
    } else if (isNumeric(t) || isPlus(t)) nums.push(t);
    else if (!UNIT_WORDS.has(t)) return { ok: false, error: `Didn't understand "${t}"` };
  }

  // Read the numbers: [weight] reps[+extra]. "6+6" before the reps is a dumbbell pair.
  let weight = 0;
  let reps = 0;
  let extraReps = 0;
  if (nums.length > 2) return { ok: false, error: 'Too many numbers: log one set at a time' };
  if (nums.length === 2) {
    const [w, r] = nums;
    if (isPlus(w)) {
      const [a, b] = w.split('+').map(Number);
      if (a !== b) return { ok: false, error: `"${w}": use the weight in one hand` };
      weight = a;
      perHand = true;
    } else weight = Number(w);
    [reps, extraReps] = splitReps(r);
  } else if (nums.length === 1) {
    if (durationSec != null) weight = Number(nums[0]);
    else [reps, extraReps] = splitReps(nums[0]);
  }
  if (!Number.isInteger(reps)) return { ok: false, error: 'Reps must be a whole number' };
  if (reps === 0 && durationSec == null) return { ok: false, error: 'How many reps?' };
  if (rpe != null && (rpe < 1 || rpe > 10)) return { ok: false, error: 'RPE goes from 1 to 10' };

  const candidates = matchExercise(typedName, knownExercises);
  const exercise = candidates.length === 1 ? candidates[0] : typedName;
  return {
    ok: true,
    set: {
      exercise,
      weight: lbs ? round2(weight * LBS_TO_KG) : weight,
      reps,
      extraReps,
      rpe,
      side,
      durationSec,
      notes: [perHand ? 'per hand' : '', lbs ? `${weight} lbs` : ''].filter(Boolean).join(', '),
    },
    isNewExercise: candidates.length === 0,
    candidates,
  };
}

function splitReps(token: string): [number, number] {
  if (token.startsWith('+')) return [0, Number(token.slice(1))];
  const [r, extra = '0'] = token.split('+');
  return [Number(r), Number(extra)];
}
