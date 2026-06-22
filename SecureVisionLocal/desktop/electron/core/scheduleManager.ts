import { listSchedules } from './scheduleRepository';
import type { RecordingSchedule } from '../../src/shared/types';

// Converte 'HH:MM' em minutos desde a meia-noite.
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

// Uma janela está ativa se o dia da semana bate e o horário atual está no intervalo.
// Janelas que cruzam a meia-noite (fim < início) são tratadas corretamente.
function isWindowActive(s: RecordingSchedule, now: Date): boolean {
  if (!s.enabled) return false;
  const day = now.getDay(); // 0=domingo … 6=sábado
  const start = toMinutes(s.startTime);
  const end = toMinutes(s.endTime);
  const cur = now.getHours() * 60 + now.getMinutes();

  if (start === end) return false; // janela vazia
  if (start < end) {
    // Mesmo dia: o dia atual precisa estar marcado.
    return s.daysOfWeek.includes(day) && cur >= start && cur < end;
  }
  // Cruza a meia-noite: parte da noite (dia marcado) OU madrugada (dia anterior marcado).
  const prevDay = (day + 6) % 7;
  return (
    (s.daysOfWeek.includes(day) && cur >= start) ||
    (s.daysOfWeek.includes(prevDay) && cur < end)
  );
}

class ScheduleManager {
  // A câmera deve estar gravando agora por causa de algum agendamento ativo?
  isCameraScheduledNow(cameraId: string, now: Date = new Date()): boolean {
    const schedules = listSchedules(cameraId);
    return schedules.some((s) => isWindowActive(s, now));
  }
}

export const scheduleManager = new ScheduleManager();
