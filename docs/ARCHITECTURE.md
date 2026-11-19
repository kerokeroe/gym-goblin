# How Gym Goblin works

## The pieces

```
browser (React SPA)  ──/api──▶  Express (server/app.js)  ──▶  SQLite (data/gym.db)
Telegram bot ──────────/api──▶        │
                                      └─ server/db.js: open + migrate on start
```

- **Frontend** (`src/`): a single-page React app. No router library: the tab lives in the URL hash (`#gains/hip%20thrust`), so refresh and the back button work.
  - `screens/`: one file per tab (Log, History, Gains, Lair).
  - `components/`: reusable pieces (Goblin, PixelChart, ExerciseCard, EditSheet, Celebration).
  - `lib/`: **pure functions** with tests: the quick-log parser, records, streaks, XP and levels, chart data. No React and no fetch inside, so they are easy to test.
  - `useGymData.ts`: loads sets and exercises once and derives everything the screens share.
- **Backend** (`server/`): Express with a small JSON API. `index.js` only starts the server; `app.js` exports `createApp(db)`, so tests can run the real routes against an in-memory database.
- **Bot** (`server/telegram-bot.js`): talks to the same API, so all validation lives in one place.

## Data

Two tables:

- `workouts`: one row per set (`date`, `exercise`, `weight`, `reps`, `extraReps`, `rpe`, `side`, `durationSec`, `notes`, `source`).
- `exercises`: per-exercise settings (`muscleGroup`, `isUnilateral`, `isAssisted`).

Conventions:
- Weight is kg, **per hand** for dumbbell pairs, and **assistance** for assisted machines.
- A timed set has `reps = 0` and `durationSec`.
- `rpe` is optional.

**Migrations** use SQLite's `PRAGMA user_version`: a number stored in the database file. On start, every migration above that number runs in order. Version 2 rebuilds the `workouts` table (create new → copy rows → drop old → rename) inside one transaction, because SQLite can't drop a `NOT NULL` constraint with `ALTER TABLE`.

## The game layer

All of it is computed from the sets on every load; nothing is stored:

- **Record (PR):** a set that beats every earlier set of the same exercise. Each set gets one score where higher is better:
  - timed sets: seconds;
  - assisted exercises: less assistance first, then more reps;
  - weighted sets: estimated 1-rep max (Epley: `weight × (1 + reps/30)`).
- **XP** = 10 per set + 50 per record. **Level N** needs `50·N·(N−1)` XP, so each level costs 100 more than the last.
- **Streak** = consecutive Monday-to-Sunday weeks with at least one workout. An empty current week doesn't break it until the week is over.

Computing instead of storing means editing or deleting a set can never leave XP out of sync.

## Quick-log parser

`src/lib/quicklog.ts` turns `bulgarian 6+6 9 L` into a set:

1. Normalize the text: `90kg` → `90 kg`, `30x8` → `30 x 8`, decimal commas, `@8` → `rpe 8`.
2. Everything before the first number is the exercise name. It matches existing names: exact match, then prefix, then "contains every typed word".
3. Read the remaining tokens: side words, units (`kg`, `lbs`, `sec`, `min`, `1:30`), and at most two numbers (`[weight] reps[+extra]`).
   - `a+a` before the reps is a dumbbell pair.
   - `n+m` as the last number means extra reps.

Anything it can't read becomes a specific error message, not a guess.

## History import

A year of workouts existed only as free-text Telegram messages (Russian and English, kg and lbs, notes like "7" meaning "same exercise, 7 reps"). The import has four steps:

1. **Filter** (`scripts/filter-telegram.js`): keep messages from 2025 on, from days that mention a unit, and only their `date` and `text`. Personal messages and metadata are dropped before anything else sees them.
2. **Extract**: an LLM read the filtered messages day by day and wrote one line per set in a simple, reviewable text format (`msg|exercise|kg|reps|options`). Each line points back to its source message. Unclear notes became review questions with a safe default (usually "skip").
3. **Review**: a person reads the questions and edits the text files.
4. **Import** (`scripts/import/`): a deterministic, tested importer.
   - It parses and validates the lines.
   - It is a dry run unless `--apply`; `--apply` backs up the database and writes in one transaction.
   - It skips days already typed by hand, and gives each set a stable `source` id (`tg:<message>:<n>`), so running it twice inserts nothing twice.

The LLM does the fuzzy part, reading messy human notes; plain code with tests does everything that touches the database.

## Testing

`npm test` runs Node's built-in test runner (Node 24 runs the `.ts` tests directly):

| What | Where |
|---|---|
| Quick-log parser, records, streaks, XP, chart data | `src/lib/*.test.ts` |
| Migrations on a legacy-shaped database | `test/db.test.js` |
| Import rules: dedup, skipping hand-typed days, renames | `test/import.test.js` |
| API: validation, 404s, round trips | `test/api.test.js` |

CI runs the tests, the type check and the build on every push.

## Decisions and trade-offs

- **SQLite, not a server database:** single user and zero setup. The cost is one writer at a time, which is fine here.
- **No chart or router library:** one SVG line chart and a hash router are a few dozen lines each, and dropping chart.js halved the bundle (323 → 172 KB).
- **Derived game state:** always correct after edits. It's recomputed on every load, which is instant at a few thousand sets.

## Next steps

- Serve the built frontend from Express, so the phone can open it over Wi-Fi or Tailscale.
- Let the Telegram bot accept the same one-line format as the web app (`parseQuickLog` is already a pure function).
- Make it installable as an app (PWA), with offline logging that syncs later.
