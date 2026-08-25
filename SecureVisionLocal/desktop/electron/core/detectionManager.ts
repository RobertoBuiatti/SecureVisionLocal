import { listCameras, isDuplicateShadow } from './cameraRepository';
import { getDetectionConfig } from './detectionRepository';
import { motionDetectionService } from './motionDetection';
import { aiDetectionService } from './ai/aiDetection';
import { streamingService } from './streaming';

const TICK_MS = 20_000;

// Mantém a detecção de movimento ativa nas câmeras configuradas (com watchdog),
// e reage a mudanças de configuração.
class DetectionManager {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    motionDetectionService.stopAll();
    aiDetectionService.stopAll();
  }

  applyCamera(cameraId: string): void {
    const camera = listCameras().find((c) => c.id === cameraId);
    if (!camera) {
      motionDetectionService.stop(cameraId);
      aiDetectionService.stop(cameraId);
      return;
    }
    const config = getDetectionConfig(cameraId);

    // Movimento e IA: ambos alimentados pela PUXADA ÚNICA do StreamingService
    // (mesma imagem já decodificada, sem abrir nova sessão RTSP na câmera).
    void streamingService.setMotion(camera, config, !!config.motionEnabled);
    void streamingService.setDetection(camera, config, !!config.aiEnabled);
  }

  // Câmeras OFFLINE não são (re)iniciadas — evita respawn de FFmpeg em loop contra
  // uma câmera inacessível. Ao voltar, o monitor de conexão a marca online e o
  // próximo ciclo religa a detecção.
  private reconcile(): void {
    const cams = listCameras();
    for (const camera of cams) {
      // Duplicata do mesmo dispositivo: desliga detecção (evita 2ª sessão RTSP do motion
      // e 2ª puxada da IA). Só o cadastro principal detecta.
      if (isDuplicateShadow(camera, cams)) {
        const cfg = getDetectionConfig(camera.id);
        void streamingService.setMotion(camera, cfg, false);
        void streamingService.setDetection(camera, cfg, false);
        continue;
      }
      const config = getDetectionConfig(camera.id);

      // Movimento e IA saem da puxada única do StreamingService (que já reconecta sozinho,
      // então nenhum dos dois precisa do antigo gate de "offline" — a puxada persiste e se
      // recupera). Antes o movimento tinha FFmpeg próprio: era uma 2ª sessão RTSP na câmera
      // e disputava a escrita do quadro ao vivo com o streaming.
      void streamingService.setMotion(camera, config, !!config.motionEnabled);
      void streamingService.setDetection(camera, config, !!config.aiEnabled);
    }
  }
}

export const detectionManager = new DetectionManager();
