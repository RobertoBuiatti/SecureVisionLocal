import { listCameras, updateCamera } from './cameraRepository';
import { testConnection } from './connection';
import type { CameraStatus } from '../../src/shared/types';
import { insertCameraLog } from './cameraLogger';

const CHECK_INTERVAL_MS = 15_000;

type Notifier = (p: { cameraId: string; status: CameraStatus }) => void;

// Verifica periodicamente a conectividade de todas as câmeras e atualiza o status,
// para detectar quedas e manter o indicador online/offline sempre correto.
class ConnectionMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private notifier?: Notifier;
  private checking = false;

  start(notifier: Notifier): void {
    this.notifier = notifier;
    if (this.timer) return;
    void this.checkAll();
    this.timer = setInterval(() => void this.checkAll(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async checkAll(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const cameras = listCameras();
      await Promise.all(
        cameras.map(async (camera) => {
          const result = await testConnection(camera);
          const status: CameraStatus = result.success ? 'online' : 'offline';
          if (status !== camera.status) {
            updateCamera(camera.id, { status });
            if (status === 'offline') {
              insertCameraLog(
                camera.id,
                camera.name,
                'warn',
                `Câmera "${camera.name}" ficou OFF-line`,
                `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nProtocolo: ${camera.protocol}\nUsuário: ${camera.username || '—'}\nURL principal: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nURL secundária: ${(camera.subStreamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nFabricante: ${camera.manufacturer || '—'}\nErro: ${result.error || 'Conexão TCP falhou'}\n\nMonitoramento automático a cada 15s. Quando a câmera retornar, as operações normais serão retomadas.`,
                'connectionMonitor',
              );
            } else {
              insertCameraLog(
                camera.id,
                camera.name,
                'info',
                `Câmera "${camera.name}" está ON-line novamente`,
                `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nLatência: ${result.latency || '—'}ms\n\nA câmera voltou a responder. Retomando gravação 24/7, detecção e outras operações automáticas.`,
                'connectionMonitor',
              );
            }
          }
          this.notifier?.({ cameraId: camera.id, status });
        }),
      );
    } finally {
      this.checking = false;
    }
  }
}

export const connectionMonitor = new ConnectionMonitor();
