import { getDb } from './db';
import { getDefaultRecordingsDir, getDataDir } from './paths';
import { join } from 'node:path';
import type { AppSettings } from '../../src/shared/types';

function defaults(): AppSettings {
  return {
    theme: 'dark',
    language: 'pt-BR',
    recordingsPath: getDefaultRecordingsDir(),
    retentionDays: 7,
    maxStorageGB: 100,
    continuousSegmentMinutes: 10,
    autoRecycle: true,
    hardwareAcceleration: 'auto',
    startWithWindows: false,
    gridLayout: 4,
    cameraOrder: [],
    serverEnabled: true,
    serverPort: 8080,
    serverToken: '',
    notificationsEnabled: true,
    webhookUrl: '',
    overlayDetectionMarks: true,
    snapshotsPath: join(getDataDir(), 'detection-snapshots'),
    snapshotsMaxCount: 100,
  };
}

export function getSettings(): AppSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'app'").get() as
    | { value: string }
    | undefined;
  if (!row) return defaults();
  try {
    return { ...defaults(), ...JSON.parse(row.value) } as AppSettings;
  } catch {
    return defaults();
  }
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const merged = { ...getSettings(), ...updates };
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('app', @value) ON CONFLICT(key) DO UPDATE SET value=@value",
    )
    .run({ value: JSON.stringify(merged) });
  return merged;
}
