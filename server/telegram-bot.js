import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log('Telegram bot disabled: set TELEGRAM_BOT_TOKEN in .env to enable it.');
  process.exit(0);
}

const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID ? Number(process.env.TELEGRAM_ALLOWED_CHAT_ID) : null;
const apiBase = process.env.API_BASE_URL || 'http://localhost:4000';

const bot = new Telegraf(token);
const sessions = new Map();

function dateYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayYMD() {
  return dateYMD(new Date());
}

function yesterdayYMD() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateYMD(d);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sideLabel(side) {
  return side === 'L' ? 'Left' : side === 'R' ? 'Right' : '';
}

// Lock the bot down to a single chat. Until TELEGRAM_ALLOWED_CHAT_ID is set,
// reply to anything with the chat id so it can be copied into .env.
bot.use((ctx, next) => {
  if (!ctx.chat) return;
  if (!allowedChatId) {
    return ctx.reply(`Bot isn't locked down yet.\nAdd this to your .env, then restart the bot:\nTELEGRAM_ALLOWED_CHAT_ID=${ctx.chat.id}`);
  }
  if (ctx.chat.id !== allowedChatId) return;
  console.log('[update]', ctx.updateType, ctx.callbackQuery?.data ?? ctx.message?.text ?? '');
  return next();
});

bot.catch((err, ctx) => {
  console.error('[error]', ctx.updateType, err);
});

bot.start((ctx) => ctx.reply('Hi! Send /log to record a set, or /quick for a one-message version that works even while this bot is offline.'));

bot.command('cancel', (ctx) => {
  sessions.delete(ctx.chat.id);
  ctx.reply('Cancelled.');
});

const QUICK_USAGE = 'Usage: /quick <exercise>; <reps>; <weight>; <rpe>[; L|R][; YYYY-MM-DD]\nOne set per line - send several lines to log a whole session at once.\nExample:\nbench press; 8; 60; 7\nbench press; 6; 65; 8';

bot.command('quick', async (ctx) => {
  sessions.delete(ctx.chat.id); // /quick is stateless; drop any in-progress /log flow
  const body = ctx.message.text.replace(/^\/quick(@\w+)?\s*/i, '').trim();
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length);
  if (!lines.length) {
    return ctx.reply(QUICK_USAGE);
  }

  let exercises;
  try {
    const res = await fetch(`${apiBase}/api/exercises/names`);
    exercises = await res.json();
  } catch {
    return ctx.reply('Could not reach the gym tracker API. Is the server running?');
  }

  // Default date is when this message was actually sent, not whenever the bot wakes up to process it.
  const sentDate = dateYMD(new Date(ctx.message.date * 1000));
  const results = [];

  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim()).filter((p) => p.length);
    if (parts.length < 4) {
      results.push(`✗ "${line}" - need exercise; reps; weight; rpe`);
      continue;
    }
    const [exerciseRaw, repsRaw, weightRaw, rpeRaw, ...rest] = parts;
    const reps = Number(repsRaw);
    const weight = Number(weightRaw);
    const rpe = Number(rpeRaw);
    if (!Number.isFinite(reps) || reps <= 0) {
      results.push(`✗ "${line}" - reps must be a positive number`);
      continue;
    }
    if (!Number.isFinite(weight) || weight < 0) {
      results.push(`✗ "${line}" - weight must be a valid number`);
      continue;
    }
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
      results.push(`✗ "${line}" - RPE must be 1-10`);
      continue;
    }

    let side = '';
    let date = sentDate;
    for (const token of rest) {
      if (/^[lr]$/i.test(token)) side = token.toUpperCase();
      else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) date = token;
    }

    const match = exercises.find((ex) => ex.name.toLowerCase() === exerciseRaw.toLowerCase());
    if (!match) {
      results.push(`✗ "${line}" - no exercise named "${exerciseRaw}"`);
      continue;
    }
    if (match.isUnilateral && !side) {
      results.push(`✗ "${line}" - ${match.name} is unilateral, add L or R`);
      continue;
    }

    try {
      const res = await fetch(`${apiBase}/api/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, exercise: match.name, reps, weight, rpe, extraReps: 0, notes: '', side })
      });
      if (!res.ok) throw new Error('save failed');
      const sideTxt = side ? ` (${sideLabel(side)})` : '';
      results.push(`✓ ${match.name}${sideTxt} on ${date} - ${reps} reps @ ${weight} kg, RPE ${rpe}`);
    } catch {
      results.push(`✗ "${line}" - could not save, is the server running?`);
    }
  }

  await ctx.reply(results.join('\n'));
});

async function promptExercise(ctx, session) {
  let exercises;
  try {
    console.log('[promptExercise] fetching', `${apiBase}/api/exercises/names`);
    const res = await fetch(`${apiBase}/api/exercises/names`);
    exercises = await res.json();
    console.log('[promptExercise] got', exercises.length, 'exercises');
  } catch (err) {
    console.error('[promptExercise] fetch failed', err);
    sessions.delete(ctx.chat.id);
    return ctx.reply('Could not reach the gym tracker API. Is the server running?');
  }
  if (!exercises.length) {
    sessions.delete(ctx.chat.id);
    return ctx.reply('No exercises in your library yet - add one in the app first.');
  }
  session.stage = 'choose_exercise';
  session.exercises = exercises;
  const buttons = chunk(exercises.map((ex, i) => ({ text: ex.name, callback_data: `ex:${i}` })), 2);
  return ctx.reply('Which exercise?', { reply_markup: { inline_keyboard: buttons } });
}

bot.command('log', async (ctx) => {
  sessions.set(ctx.chat.id, { stage: 'choose_date' });
  await ctx.reply('Which date?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Today', callback_data: 'date:today' }, { text: 'Yesterday', callback_data: 'date:yesterday' }],
        [{ text: 'Other date...', callback_data: 'date:other' }]
      ]
    }
  });
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const session = sessions.get(ctx.chat.id);
  await ctx.answerCbQuery();

  if (data.startsWith('date:')) {
    if (!session || session.stage !== 'choose_date') return;
    const choice = data.slice(5);
    if (choice === 'other') {
      session.stage = 'enter_date';
      await ctx.editMessageText('Send the date as YYYY-MM-DD.');
      return;
    }
    session.date = choice === 'today' ? todayYMD() : yesterdayYMD();
    await ctx.editMessageText(`Date: ${session.date}`);
    await promptExercise(ctx, session);
    return;
  }

  if (data.startsWith('ex:')) {
    if (!session || session.stage !== 'choose_exercise') return;
    const ex = session.exercises[Number(data.slice(3))];
    session.exercise = ex.name;
    if (ex.isUnilateral) {
      session.stage = 'choose_side';
      await ctx.editMessageText(`${ex.name} - which side?`, {
        reply_markup: { inline_keyboard: [[{ text: 'Left', callback_data: 'side:L' }, { text: 'Right', callback_data: 'side:R' }]] }
      });
    } else {
      session.stage = 'enter_reps';
      await ctx.editMessageText(`${ex.name} - how many reps?`);
    }
    return;
  }

  if (data.startsWith('side:')) {
    if (!session || session.stage !== 'choose_side') return;
    session.side = data.slice(5);
    session.stage = 'enter_reps';
    await ctx.editMessageText(`${session.exercise} (${sideLabel(session.side)}) - how many reps?`);
    return;
  }

  if (data === 'confirm:yes') {
    if (!session || session.stage !== 'confirm') return;
    try {
      const res = await fetch(`${apiBase}/api/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: session.date,
          exercise: session.exercise,
          reps: session.reps,
          weight: session.weight,
          rpe: session.rpe,
          extraReps: 0,
          notes: '',
          side: session.side || ''
        })
      });
      if (!res.ok) throw new Error('save failed');
      const side = session.side ? ` (${sideLabel(session.side)})` : '';
      await ctx.editMessageText(`Saved: ${session.exercise}${side} on ${session.date} - ${session.reps} reps @ ${session.weight} kg, RPE ${session.rpe}.`);
    } catch {
      await ctx.editMessageText('Could not save - is the server running? Try /log again.');
    }
    sessions.delete(ctx.chat.id);
    return;
  }

  if (data === 'confirm:no') {
    sessions.delete(ctx.chat.id);
    await ctx.editMessageText('Cancelled.');
  }
});

bot.on('text', async (ctx) => {
  const session = sessions.get(ctx.chat.id);
  if (!session) {
    return ctx.reply('Send /log to record a set.');
  }
  const value = ctx.message.text.trim();

  if (session.stage === 'enter_date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime())) {
      return ctx.reply('Enter a valid date as YYYY-MM-DD, e.g. 2026-06-25.');
    }
    session.date = value;
    return promptExercise(ctx, session);
  }

  if (session.stage === 'enter_reps') {
    const reps = Number(value);
    if (!Number.isFinite(reps) || reps <= 0) return ctx.reply('Enter a positive number for reps.');
    session.reps = reps;
    session.stage = 'enter_weight';
    return ctx.reply('Weight (kg)?');
  }

  if (session.stage === 'enter_weight') {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight < 0) return ctx.reply('Enter a valid weight in kg.');
    session.weight = weight;
    session.stage = 'enter_rpe';
    return ctx.reply('RPE (1-10)?');
  }

  if (session.stage === 'enter_rpe') {
    const rpe = Number(value);
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) return ctx.reply('Enter a number from 1 to 10.');
    session.rpe = rpe;
    session.stage = 'confirm';
    const side = session.side ? ` (${sideLabel(session.side)})` : '';
    return ctx.reply(
      `Log ${session.exercise}${side} on ${session.date} - ${session.reps} reps @ ${session.weight} kg, RPE ${session.rpe}?`,
      { reply_markup: { inline_keyboard: [[{ text: 'Save', callback_data: 'confirm:yes' }, { text: 'Cancel', callback_data: 'confirm:no' }]] } }
    );
  }

  return ctx.reply('Send /log to record a set, or /cancel to stop.');
});

bot
  .launch(() => console.log('Telegram bot started (long polling).'))
  .catch((err) => console.error('Telegram bot failed to start - check TELEGRAM_BOT_TOKEN:', err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
