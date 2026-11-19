// Entry point: open (and migrate) the database, then start the HTTP server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openAndMigrate } from './db.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.GYM_DB ?? path.join(__dirname, '../data/gym.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db;
try {
  db = await openAndMigrate(dbPath);
} catch (err) {
  console.error('Failed to open database:', err);
  process.exit(1);
}

const port = process.env.PORT || 4000;
createApp(db).listen(port, () => {
  console.log(`Gym Goblin API running at http://localhost:${port} (db: ${dbPath})`);
});
