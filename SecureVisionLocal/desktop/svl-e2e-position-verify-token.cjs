/* Extrai o token do servidor do banco em execução */
const Database = require('better-sqlite3');
const dbPath = 'C:\\Users\\rober\\AppData\\Roaming\\securevision-local-desktop\\securevision.db';
const db = new Database(dbPath);
const row = db.prepare("SELECT value FROM settings WHERE key = 'app'").get();
if (row) {
  const settings = JSON.parse(row.value);
  console.log(settings.serverToken);
}
db.close();
