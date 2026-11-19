// Parser for the intermediate "extracted sets" format produced from Telegram
// Saved Messages (one line per set, written by an AI pass and reviewed by a human).
//
//   msg|exercise|weightKg|reps|opts...
//   ?msgs|question for the human|default
//
// msg      index of the source message in filtered.json (gives the date)
// opts     nK = K identical sets, L/R = side, tS = duration in seconds,
//          pX = RPE, +N = extra reps, dYYYY-MM-DD = date override, #text = note
// review   default is either "skip" or a full set line, which is imported as-is
// Lines starting with "#" are comments.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseOpts(opts, set) {
  for (const raw of opts) {
    const opt = raw.trim();
    if (opt === '') continue;
    if (opt.startsWith('#')) set.notes = opt.slice(1).trim();
    else if (opt === 'L' || opt === 'R') set.side = opt;
    else if (/^n\d+$/.test(opt)) set.count = Number(opt.slice(1));
    else if (/^t\d+$/.test(opt)) set.durationSec = Number(opt.slice(1));
    else if (/^p\d+(\.\d+)?$/.test(opt)) set.rpe = Number(opt.slice(1));
    else if (/^\+\d+$/.test(opt)) set.extraReps = Number(opt.slice(1));
    else if (/^d\d{4}-\d{2}-\d{2}$/.test(opt)) set.date = opt.slice(1);
    else throw new Error(`unknown option "${opt}"`);
  }
}

/** Parse one set line into a set object (without date/source yet). */
export function parseSetLine(line) {
  const [msgRaw, exercise, weightRaw, repsRaw, ...opts] = line.split('|');
  const msg = Number(msgRaw);
  const weight = Number(weightRaw);
  const reps = Number(repsRaw);
  if (!Number.isInteger(msg) || msg < 0) throw new Error(`bad message index "${msgRaw}"`);
  if (!exercise || exercise.trim() !== exercise || exercise !== exercise.toLowerCase()) {
    throw new Error(`exercise must be trimmed lowercase, got "${exercise}"`);
  }
  if (!Number.isFinite(weight) || weight < 0) throw new Error(`bad weight "${weightRaw}"`);
  if (!Number.isInteger(reps) || reps < 0) throw new Error(`bad reps "${repsRaw}"`);

  const set = { msg, exercise, weight, reps, extraReps: 0, side: '', durationSec: null, rpe: null, notes: '', count: 1, date: null };
  parseOpts(opts, set);
  if (set.reps === 0 && set.durationSec == null) throw new Error('a set needs reps or a duration');
  if (set.rpe != null && (set.rpe < 1 || set.rpe > 10)) throw new Error(`rpe out of range: ${set.rpe}`);
  return set;
}

/**
 * Parse a whole extracted file.
 * @param {string} text      file contents
 * @param {(msg: number) => string} dateOf  message index -> ISO date (YYYY-MM-DD)
 * @param {string} file      name used in error messages
 * @returns {{ sets: object[], reviews: object[] }}
 */
export function parseExtracted(text, dateOf, file = 'input') {
  const sets = [];
  const reviews = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    const where = `${file}:${i + 1}`;
    if (line === '' || line.startsWith('#')) return;
    try {
      let setLine = line;
      if (line.startsWith('?')) {
        const [msgs, question, ...rest] = line.slice(1).split('|');
        const fallback = rest.join('|');
        reviews.push({ where, msgs, question, fallback });
        if (fallback === 'skip') return;
        setLine = fallback;
      }
      const set = parseSetLine(setLine);
      const date = set.date ?? dateOf(set.msg);
      if (!DATE_RE.test(date ?? '')) throw new Error(`no date for message ${set.msg}`);
      const { count, msg, ...rest } = set;
      for (let k = 0; k < count; k++) sets.push({ ...rest, date, msg });
    } catch (err) {
      throw new Error(`${where}: ${err.message}`);
    }
  });
  return { sets, reviews };
}

/**
 * Give every set a stable `source` id: "tg:<msg>:<k>" where k counts sets from
 * the same message. Re-running the import on the same files yields the same ids,
 * which is what lets the importer skip sets it has already saved.
 */
export function assignSources(sets) {
  const perMessage = new Map();
  return sets.map((s) => {
    const k = perMessage.get(s.msg) ?? 0;
    perMessage.set(s.msg, k + 1);
    return { ...s, source: `tg:${s.msg}:${k}` };
  });
}
