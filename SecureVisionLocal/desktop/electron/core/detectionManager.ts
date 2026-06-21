import { listCameras } from './cameraRepository';
import { getDetectionConfig } from './detectionRepository';
import { motionDetectionService } from './motionDetection';
import { aiDetectionService } from './ai/aiDetection';

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

    // IA (objetos / incêndio / fumaça)
    if (config.aiEnabled) {
      aiDetectionService.stop(cameraId);
      aiDetectionService.start(camera, config);
    } else if (aiDetectionService.isActive(cameraId)) {
      aiDetectionService.stop(cameraId);
    }
  }

  private reconcile(): void {
    for (const camera of listCameras()) {
      const config = getDetectionConfig(camera.id);
      if (config.motionEnabled) {
        if (!motionDetectionService.isActive(camera.id)) {
          motionDetectionService.start(camera, config);
        }
      } else if (motionDetectionService.isActive(camera.id)) {
        motionDetectionService.stop(camera.id);
      }

      if (config.aiEnabled) {
        if (!aiDetectionService.isActive(camera.id)) {
          aiDetectionService.start(camera, config);
        }
      } else if (aiDetectionService.isActive(camera.id)) {
        aiDetectionService.stop(camera.id);
      }
    }
  }
}

export const detectionManager = new DetectionManager();
