import { createApp } from "./app.js";
import {
  BACKUP_DIR,
  createDatabase,
  DATABASE_PATH,
  ensureDailyBackup
} from "./database.js";

const HOST = "127.0.0.1";
const PORT = 8787;

const db = createDatabase();
const app = createApp(db, { backupDirectory: BACKUP_DIR });

void ensureDailyBackup(db).catch((error) => {
  console.error("自動バックアップに失敗しました。", error);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`AI Web Factory API: http://${HOST}:${PORT}`);
  console.log(`SQLite: ${DATABASE_PATH}`);
  console.log(`Backup: ${BACKUP_DIR}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
