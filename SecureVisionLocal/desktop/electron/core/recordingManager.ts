import type { Camera } from '../../src/shared/types';
import { listCameras } from './cameraRepository';
import { continuousRecordingService } from './continuousRecording';
import { enforceRetention } from './retention';
import { scheduleManager } from './scheduleManager';
import { insertCameraLog } from './cameraLogger';

// Uma câmera deve gravar continuamente se estiver marcada como 24/7 OU se estiver
// dentro de uma janela de agendamento ativa neste momento.
function shouldRecordContinuous(camera: Camera): boolean {
  return camera.recordContinuous || scheduleManager.isCameraScheduledNow(camera.id);
}

const TICK_MS = 30_000;

// Orquestra a gravação contínua 24/7: mantém as câmeras marcadas sempre gravando,
// reinicia processos caídos (watchdog), indexa segmentos e aplica a retenção.
class RecordingManager {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    continuousRecordingService.stopAll();
  }

  // Liga/desliga a gravação contínua de uma câmera específica (resposta imediata
  // quando o usuário ativa/desativa "Gravar 24/7").
  applyCamera(camera: Camera): void {
    const shouldRecord = shouldRecordContinuous(camera);
    if (shouldRecord && !continuousRecordingService.isActive(camera.id)) {
      continuousRecordingService.start(camera);
    } else if (!shouldRecord && continuousRecordingService.isActive(camera.id)) {
      continuousRecordingService.stop(camera.id);
    }
  }

  private tick(): void {
    this.reconcile();
    continuousRecordingService.sync();
    try {
      enforceRetention();
    } catch {
      /* não interrompe o ciclo se a retenção falhar */
    }
  }

  // Garante que o conjunto em gravação corresponde às câmeras marcadas como 24/7.
  // Câmeras cujo FFmpeg morreu voltam a ser iniciadas aqui (auto-restart).
  // Câmeras OFFLINE (segundo o monitor de conexão) não são reiniciadas — evita
  // respawn de FFmpeg em loop contra uma câmera inacessível (desperdício de CPU).
  // Quando a câmera volta, o monitor a marca online e o próximo ciclo religa tudo.
  private reconcile(): void {
    for (const camera of listCameras()) {
      if (shouldRecordContinuous(camera)) {
        if (camera.status === 'offline') {
          insertCameraLog(
            camera.id,
            camera.name,
            'warn',
            `Gravação 24/7 de "${camera.name}" pulada — câmera offline`,
            `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\n\nA câmera está marcada como offline. A gravação contínua será ignorada até que a conexão seja restabelecida. Isso evita respawn infinito de FFmpeg contra uma câmera inacessível.`,
            'recording',
          );
        } else if (!continuousRecordingService.isActive(camera.id)) {
          continuousRecordingService.start(camera);
        }
      } else if (!shouldRecordContinuous(camera) && continuousRecordingService.isActive(camera.id)) {
        continuousRecordingService.stop(camera.id);
      }
    }
  }
}

export const recordingManager = new RecordingManager();
