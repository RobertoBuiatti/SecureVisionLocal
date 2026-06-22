import { Notification } from 'electron';
import type { DetectionEvent } from '../../src/shared/types';
import { getSettings } from './settings';

const TYPE_LABEL: Record<string, string> = {
  motion: 'Movimento',
  person: 'Pessoa',
  vehicle: 'Veículo',
  animal: 'Animal',
};

// Anti-spam: no máximo um alerta a cada 15s por câmera.
const COOLDOWN_MS = 15_000;
const lastAlertAt = new Map<string, number>();

// Dispara notificação nativa do Windows e/ou webhook para um evento de detecção.
// Tolerante a falhas: nunca interrompe o fluxo de detecção/gravação.
export function notifyDetection(ev: DetectionEvent): void {
  const settings = getSettings();
  if (!settings.notificationsEnabled && !settings.webhookUrl) return;

  const now = Date.now();
  const last = lastAlertAt.get(ev.cameraId) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastAlertAt.set(ev.cameraId, now);

  const label = TYPE_LABEL[ev.type] ?? ev.type;
  const camName = ev.cameraName ?? ev.cameraId;

  if (settings.notificationsEnabled && Notification.isSupported()) {
    try {
      new Notification({
        title: `SecureVision — ${label}`,
        body: `${label} detectado em ${camName}.`,
      }).show();
    } catch {
      /* não derruba o app se a notificação falhar */
    }
  }

  if (settings.webhookUrl) {
    void postWebhook(settings.webhookUrl, ev);
  }
}

async function postWebhook(url: string, ev: DetectionEvent): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'SecureVision Local',
        cameraId: ev.cameraId,
        cameraName: ev.cameraName,
        type: ev.type,
        score: ev.score,
        timestamp: ev.timestamp,
      }),
    });
  } catch {
    /* webhook indisponível — ignora silenciosamente */
  }
}
