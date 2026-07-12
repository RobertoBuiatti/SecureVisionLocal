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

    // Movimento (reinicia para aplicar nova sensibilidade/regras)
    if (config.motionEnabled) {
      motionDetectionService.stop(cameraId);
      motionDetectionService.start(camera, config);
    } else if (motionDetectionService.isActive(cameraId)) {
      motionDetectionService.stop(cameraId);
    }

    // IA: alimentada pela PUXADA ÚNICA do StreamingService (mesma imagem, sem nova sessão).
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
        if (motionDetectionService.isActive(camera.id)) motionDetectionService.stop(camera.id);
        void streamingService.setDetection(camera, getDetectionConfig(camera.id), false);
        continue;
      }
      const config = getDetectionConfig(camera.id);
      const reachable = camera.status !== 'offline';

      // Movimento: serviço próprio (só sobe quando alcançável, evita respawn em loop).
      if (config.motionEnabled && reachable) {
        if (!motionDetectionService.isActive(camera.id)) {
          motionDetectionService.start(camera, config);
        }
      } else if (!config.motionEnabled && motionDetectionService.isActive(camera.id)) {
        motionDetectionService.stop(camera.id);
      }

      // IA: alimentada pela puxada única do StreamingService (que já reconecta sozinho,
      // então não precisa do gate de "offline" — a puxada persiste e se recupera).
      void streamingService.setDetection(camera, config, !!config.aiEnabled);
    }
  }
}

export const detectionManager = new DetectionManager();
