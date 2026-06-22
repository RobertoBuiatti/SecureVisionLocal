import type { Camera } from '../../src/shared/types';
import { listCameras } from './cameraRepository';
import { continuousRecordingService } from './continuousRecording';
import { enforceRetention } from './retention';
import { scheduleManager } from './scheduleManager';

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
  private reconcile(): void {
    for (const camera of listCameras()) {
      if (shouldRecordContinuous(camera)) {
        if (!continuousRecordingService.isActive(camera.id)) {
          continuousRecordingService.start(camera);
        }
      } else if (continuousRecordingService.isActive(camera.id)) {
        continuousRecordingService.stop(camera.id);
      }
    }
  }
}

export const recordingManager = new RecordingManager();
