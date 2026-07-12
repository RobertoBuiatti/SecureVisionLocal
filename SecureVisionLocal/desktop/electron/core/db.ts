import Database from 'better-sqlite3';
import { getDbPath } from './paths';

// Instância única do SQLite. O schema é criado/migrado na primeira execução.
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cameras (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL,
      type TEXT NOT NULL,
      manufacturer TEXT,
      username TEXT,
      password TEXT,
      streamUrl TEXT NOT NULL,
      subStreamUrl TEXT,
      onvifProfile TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      hasPTZ INTEGER NOT NULL DEFAULT 0,
      hasAudio INTEGER NOT NULL DEFAULT 0,
      presetCount INTEGER NOT NULL DEFAULT 0,
      recordContinuous INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      cameraName TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      startTime INTEGER NOT NULL,
      endTime INTEGER,
      duration INTEGER NOT NULL DEFAULT 0,
      fileSize INTEGER NOT NULL DEFAULT 0,
      filePath TEXT NOT NULL,
      thumbnailPath TEXT,
      hasMotion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_camera ON recordings(cameraId);
    CREATE INDEX IF NOT EXISTS idx_recordings_start ON recordings(startTime);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      meta TEXT,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ptz_presets (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      name TEXT NOT NULL,
      token TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ptz_tours (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      name TEXT NOT NULL,
      steps TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS detection_config (
      cameraId TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_tours (
      cameraId TEXT PRIMARY KEY,
      tourId TEXT NOT NULL,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recording_schedules (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      daysOfWeek TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_camera ON recording_schedules(cameraId);

    CREATE INDEX IF NOT EXISTS idx_presets_camera ON ptz_presets(cameraId);
    CREATE INDEX IF NOT EXISTS idx_tours_camera ON ptz_tours(cameraId);
    CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp);

    CREATE TABLE IF NOT EXISTS preset_reference_marks (
      id TEXT PRIMARY KEY,
      presetId TEXT NOT NULL,
      type TEXT NOT NULL,
      points TEXT NOT NULL,
      expectedDistanceLeft REAL NOT NULL DEFAULT 0,
      expectedDistanceTop REAL NOT NULL DEFAULT 0,
      tolerance REAL NOT NULL DEFAULT 10,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (presetId) REFERENCES ptz_presets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ref_marks_preset ON preset_reference_marks(presetId);

    CREATE TABLE IF NOT EXISTS detection_snapshots (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      detectionType TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      filePath TEXT NOT NULL,
      score REAL,
      FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_det_snaps_camera ON detection_snapshots(cameraId);
    CREATE INDEX IF NOT EXISTS idx_det_snaps_time ON detection_snapshots(timestamp);

    CREATE TABLE IF NOT EXISTS camera_logs (
      id TEXT PRIMARY KEY,
      cameraId TEXT NOT NULL,
      cameraName TEXT DEFAULT '',
      level TEXT NOT NULL DEFAULT 'error',
      message TEXT NOT NULL,
      details TEXT DEFAULT '',
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_camera_logs_camera ON camera_logs(cameraId);
    CREATE INDEX IF NOT EXISTS idx_camera_logs_time ON camera_logs(timestamp);
  `);

  addColumnIfMissing(database, 'cameras', 'onvifPort', 'INTEGER');
  addColumnIfMissing(database, 'cameras', 'hasOnboardTracking', 'INTEGER');
  addColumnIfMissing(database, 'cameras', 'mac', 'TEXT');
  addColumnIfMissing(database, 'ptz_presets', 'snapshotPath', 'TEXT');
  addColumnIfMissing(database, 'ptz_presets', 'lastCheckAt', 'INTEGER');
  addColumnIfMissing(database, 'ptz_presets', 'lastCheckOk', 'INTEGER');
  addColumnIfMissing(database, 'ptz_presets', 'lastCheckScore', 'INTEGER');
  addColumnIfMissing(database, 'recordings', 'detectionType', 'TEXT');
}

// Adiciona uma coluna se ainda não existir (migração idempotente).
function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
