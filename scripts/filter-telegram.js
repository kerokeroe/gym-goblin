// Step A of the Saved Messages import: shrink a Telegram JSON export down to
// the messages that look like gym notes, keeping only { date, text }.
//
// Usage: node scripts/filter-telegram.js <result.json> [startDate=2025-01-01]
// Writes filtered.json next to the input file (outside the repo on purpose:
// it still contains your own message text).
import fs from "fs";
import path from "path";

const inputPath = process.argv[2];
const startDate = process.argv[3] ?? "2025-01-01";
if (!inputPath) {
  console.error("Usage: node scripts/filter-telegram.js <result.json> [startDate]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// 1. Minimize: keep only the two fields we need. text_entities is always an
//    array of { type, text }, so joining it works for plain and formatted text.
const messages = data.messages
  .map((m) => ({ date: m.date, text: m.text_entities.map((e) => e.text).join("").trim() }))
  .filter((m) => m.text !== "" && m.date >= startDate);

// 2. A "gym day" is a day with at least one message that names a unit.
const UNIT = /\d\s*(kg|кг|lbs?|sec|сек|s\b|reps?)|\b(kg|lbs?)\b/i;
const gymDays = new Set(messages.filter((m) => UNIT.test(m.text)).map((m) => m.date.slice(0, 10)));

// 3. On gym days keep short messages with a digit ("32 kg", "3 +2", "7") -
//    follow-ups carry the previous exercise. Long messages are almost never sets.
const gym = messages.filter(
  (m) => gymDays.has(m.date.slice(0, 10)) && /\d/.test(m.text) && m.text.length <= 80
);

const outputPath = path.join(path.dirname(inputPath), "filtered.json");
fs.writeFileSync(outputPath, JSON.stringify(gym, null, 2));

console.log(`text messages since ${startDate}: ${messages.length}`);
console.log(`gym days: ${gymDays.size}, gym-like messages kept: ${gym.length}`);
console.log(`range: ${gym[0]?.date} .. ${gym.at(-1)?.date}`);
console.log(`written: ${outputPath}`);
