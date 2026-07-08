/* Insere preset PTZ fake no banco de TESTE (uso: via ELECTRON_RUN_AS_NODE).
 * argv: <userDataDir> <cameraId> <presetId>
 */
const Database = require('better-sqlite3');
const { join } = require('node:path');
const [, , userData, cameraId, presetId] = process.argv;
const db = new Database(join(userData, 'securevision.db'));
db.prepare('INSERT OR IGNORE INTO ptz_presets (id, cameraId, name, token, createdAt) VALUES (?, ?, ?, ?, ?)')
  .run(presetId, cameraId, 'Preset 1', 'test_token', Date.now());
db.close();
console.log(`preset ${presetId} inserido`);
