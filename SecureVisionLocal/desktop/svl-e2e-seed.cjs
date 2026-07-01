/* Insere gravações fake (person/motion) no banco de TESTE (uso: via ELECTRON_RUN_AS_NODE).
 * argv: <userDataDir> <camIdA> <camIdB>
 */
const Database = require('better-sqlite3');
const { join } = require('node:path');

const [, , userData, camA, camB] = process.argv;
const db = new Database(join(userData, 'securevision.db'));
const now = Date.now();
const st = db.prepare(`INSERT OR REPLACE INTO recordings
  (id, cameraId, cameraName, type, detectionType, status, startTime, endTime, duration, fileSize, filePath, hasMotion)
  VALUES (@id, @cameraId, @cameraName, @type, @det, 'completed', @start, @end, 60, 1000, @fp, 1)`);
st.run({ id: 'rec_teste_p1', cameraId: camA, cameraName: 'TesteCam 1', type: 'event', det: 'person', start: now - 120000, end: now - 60000, fp: 'C:\\nao-existe\\p1.mp4' });
st.run({ id: 'rec_teste_m1', cameraId: camB, cameraName: 'TesteCam 2', type: 'motion', det: 'motion', start: now - 300000, end: now - 240000, fp: 'C:\\nao-existe\\m1.mp4' });
db.close();
console.log('seed ok');
