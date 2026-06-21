import { listCameras, updateCamera } from './cameraRepository';
import { testConnection } from './connection';
import type { CameraStatus } from '../../src/shared/types';

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
