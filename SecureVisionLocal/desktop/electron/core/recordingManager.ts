import type { Camera } from '../../src/shared/types';
import { listCameras, isDuplicateShadow } from './cameraRepository';
import { continuousRecordingService, recordingCameraDir } from './continuousRecording';
import { streamingService } from './streaming';
import { getSettings } from './settings';
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
  }

  private segmentSeconds(): number {
    return Math.max(1, getSettings().continuousSegmentMinutes) * 60;
  }

  // Liga/desliga a gravação 24/7 de uma câmera (resposta imediata ao usuário).
  // A gravação é uma SAÍDA da puxada única do StreamingService — não abre sessão nova.
  applyCamera(camera: Camera): void {
    if (shouldRecordContinuous(camera)) {
      void streamingService.setRecording(
        camera,
        true,
        recordingCameraDir(camera.id),
        this.segmentSeconds(),
      );
    } else {
      void streamingService.setRecording(camera, false, '', 0);
      continuousRecordingService.finalize(camera.id);
    }
  }

  private tick(): void {
    this.reconcile();
    try {
      enforceRetention();
    } catch {
      /* não interrompe o ciclo se a retenção falhar */
    }
  }

  // Mantém a gravação 24/7 pedida como SAÍDA da puxada única (o StreamingService cuida
  // de reconexão/failover) e indexa os segmentos gravados. Não há mais "pular offline":
  // a puxada persiste e se recupera sozinha.
  private reconcile(): void {
    const cams = listCameras();
    for (const camera of cams) {
      const dir = recordingCameraDir(camera.id);
      // Duplicata do mesmo dispositivo: não grava (evita 2ª puxada RTSP na câmera). Só o
      // cadastro principal grava; assim não há contenção de sessão / lag.
      if (isDuplicateShadow(camera, cams)) {
        void streamingService.setRecording(camera, false, '', 0);
        continue;
      }
      if (shouldRecordContinuous(camera)) {
        void streamingService.setRecording(camera, true, dir, this.segmentSeconds());
        continuousRecordingService.indexSegments(camera.id, camera.name, dir, true);
      } else {
        void streamingService.setRecording(camera, false, '', 0);
        continuousRecordingService.indexSegments(camera.id, camera.name, dir, false);
      }
    }
  }
}

export const recordingManager = new RecordingManager();
