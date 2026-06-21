import { cpus, totalmem, freemem } from 'node:os';
import { statfsSync } from 'node:fs';
import { listCameras } from './cameraRepository';
import { countRecordings } from './recordingRepository';
import { getSettings } from './settings';
import type { SystemStatus } from '../../src/shared/types';

let lastCpu = sampleCpu();

function sampleCpu(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function cpuUsagePercent(): number {
  const current = sampleCpu();
  const idleDiff = current.idle - lastCpu.idle;
  const totalDiff = current.total - lastCpu.total;
  lastCpu = current;
  if (totalDiff <= 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 100);
}

function diskUsageGB(path: string): { usedGB: number; totalGB: number } {
  try {
    const s = statfsSync(path);
    const totalBytes = s.blocks * s.bsize;
    const freeBytes = s.bfree * s.bsize;
    const usedBytes = totalBytes - freeBytes;
    return {
      usedGB: Math.round((usedBytes / 1e9) * 10) / 10,
      totalGB: Math.round((totalBytes / 1e9) * 10) / 10,
    };
  } catch {
    return { usedGB: 0, totalGB: 0 };
  }
}

export function getSystemStatus(): SystemStatus {
  const cameras = listCameras();
  const online = cameras.filter((c) => c.status === 'online').length;
  const disk = diskUsageGB(getSettings().recordingsPath);

  return {
    uptime: Math.round(process.uptime()),
    cpuUsage: cpuUsagePercent(),
    memoryUsage: Math.round(((totalmem() - freemem()) / totalmem()) * 100),
    storageUsedGB: disk.usedGB,
    storageTotalGB: disk.totalGB,
    recordingCount: countRecordings(),
    camerasTotal: cameras.length,
    camerasOnline: online,
    camerasOffline: cameras.length - online,
  };
}
