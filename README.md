# Gym Buddy

A local gym tracker app built with React, Vite, Express, and SQLite.

## Run locally

1. Open a terminal in `c:\Users\user\Desktop\Gym Tracker`
2. Run `npm install`
3. Run `npm run dev`
4. Open `http://localhost:5173`

## Features

- Log workouts with exercise name, reps, weight, RPE, and extra reps
- Calendar tab shows workouts grouped by date
- Exercises tab lists saved exercises and shows progression over time
- Muscle Groups tab shows weekly set counts per muscle group
- Log sets from your phone via a Telegram bot
- Stores data locally in `data/gym.db`

## Logging from your phone via Telegram

1. In Telegram, message [@BotFather](https://t.me/botfather) and send `/newbot`, follow the prompts. It gives you a bot token.
2. Open `.env` in the project root and set `TELEGRAM_BOT_TOKEN=<your token>`.
3. Run `npm run bot` (or `npm run dev`, which now also starts the bot).
4. In Telegram, message your new bot anything (e.g. `/start`). It will reply with your chat id and tell you to add it to `.env` as `TELEGRAM_ALLOWED_CHAT_ID`.
5. Add that chat id to `.env`, then restart the bot. From now on, only messages from that chat are accepted.
6. Send `/log` to the bot, pick an exercise from the buttons, answer reps/weight/RPE (and side, if the exercise is unilateral), then confirm to save.

The bot uses Telegram long polling, so you don't need to expose your machine to the internet — but it only saves entries while your PC and `npm run dev`/`npm run bot` are running. If you send `/log` while the bot is offline, Telegram queues the conversation, but the guided flow can't progress until the bot is back online since each step needs a live reply.

### Logging while the bot is offline: `/quick`

`/log`'s button flow needs the bot running for every step. `/quick` is a one-shot alternative: type the whole set as a single message and send it - Telegram queues it regardless of whether the bot is running, and it gets parsed and saved in one pass next time the bot starts, dated to when you actually sent it.

```
/quick <exercise>; <reps>; <weight>; <rpe>[; L|R][; YYYY-MM-DD]
```

Send several lines in one message to log a whole session at once:

```
/quick
bench press; 8; 60; 7
bench press; 6; 65; 8
squat; 5; 100; 9
```

The exercise name must match your library exactly (case-insensitive). The bot replies with one line per set logged, or an error for any line it couldn't parse so you can resend just that one.

## Migrating existing data from lbs → kg

If your existing data was logged in pounds and you want to convert stored `weight` values to kilograms, the repository includes a migration script that will:

- Create a backup copy of your database at `data/gym.db.bak.<timestamp>`
- Convert all `workouts.weight` values by multiplying by 0.45359237 and rounding to 2 decimals

Run the migration (dry-run safety):

```bash
# shows a warning and won't run if values look already in kg
npm run migrate-lbs-to-kg
```

If the script warns that weights look small (likely already kg), re-run with `--force` to proceed anyway:

```bash
npm run migrate-lbs-to-kg -- --force
```

The script exits with a non-zero code if it aborts; check the created backup before proceeding.
