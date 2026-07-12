import { listCameras, updateCamera } from './cameraRepository';
import { testConnection } from './connection';
import type { Camera, CameraStatus } from '../../src/shared/types';
import { insertCameraLog } from './cameraLogger';
import { getMacForIp, findIpForMac, rtspHostPort, rewriteRtspHost } from './ipResolver';
import { streamingService } from './streaming';
import { detectionManager } from './detectionManager';
import { recordingManager } from './recordingManager';

const CHECK_INTERVAL_MS = 15_000;
const HEAL_COOLDOWN_MS = 60_000; // no máx. 1 varredura de auto-cura por minuto/câmera

type Notifier = (p: { cameraId: string; status: CameraStatus }) => void;

// Verifica periodicamente a conectividade de todas as câmeras e atualiza o status.
// Também aprende o MAC de cada câmera e mantém o IP correto quando ele muda (DHCP no
// WiFi): reconcilia a URL para o host que responde e, se a câmera sumir do IP atual,
// a reencontra na rede pelo MAC.
class ConnectionMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private notifier?: Notifier;
  private checking = false;
  private lastHeal = new Map<string, number>();

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

  private streamHost(camera: Camera): string {
    return rtspHostPort(camera.streamUrl || camera.subStreamUrl || '')?.host ?? camera.ip;
  }

  // Aplica um novo host à câmera: reescreve o IP do cadastro e o host das URLs, e
  // reinicia streaming/detecção/gravação para usarem o novo endereço imediatamente.
  private applyNewHost(camera: Camera, newHost: string, reason: string): Camera | null {
    const oldHost = this.streamHost(camera);
    const streamUrl = camera.streamUrl ? rewriteRtspHost(camera.streamUrl, newHost) : camera.streamUrl;
    const subStreamUrl = camera.subStreamUrl
      ? rewriteRtspHost(camera.subStreamUrl, newHost)
      : camera.subStreamUrl;
    const updated = updateCamera(camera.id, { ip: newHost, streamUrl, subStreamUrl });
    if (!updated) return null;

    insertCameraLog(
      camera.id,
      camera.name,
      'warn',
      `IP de "${camera.name}" atualizado: ${oldHost} → ${newHost} (${reason})`,
      `Câmera: ${camera.name}\nMAC: ${camera.mac || '—'}\nHost antigo: ${oldHost}\nHost novo: ${newHost}\nMotivo: ${reason}\n\nO endereço da câmera mudou (DHCP). O app atualizou o cadastro e as URLs automaticamente e reiniciou streaming, detecção e gravação com o novo IP.`,
      'connectionMonitor',
    );

    try {
      streamingService.refreshCamera(updated);
    } catch {
      /* noop */
    }
    try {
      detectionManager.applyCamera(updated.id);
    } catch {
      /* noop */
    }
    try {
      recordingManager.applyCamera(updated);
    } catch {
      /* noop */
    }
    return updated;
  }

  // Câmera offline: reencontra o IP atual pelo MAC (varredura ARP da sub-rede).
  private async tryHeal(camera: Camera): Promise<Camera | null> {
    if (!camera.mac) return null;
    const now = Date.now();
    if (now - (this.lastHeal.get(camera.id) ?? 0) < HEAL_COOLDOWN_MS) return null;
    this.lastHeal.set(camera.id, now);

    const newIp = await findIpForMac(camera.mac);
    if (!newIp || newIp === this.streamHost(camera)) return null;
    return this.applyNewHost(camera, newIp, 'reencontrada pelo MAC na rede');
  }

  private async checkAll(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const cameras = listCameras();
      await Promise.all(
        cameras.map(async (camera) => {
          let cam = camera;
          let result = await testConnection(cam);

          if (result.success) {
            // Se o host que respondeu difere do host da URL, reconcilia para o IP que funciona.
            if (result.host && result.host !== this.streamHost(cam)) {
              const fixed = this.applyNewHost(cam, result.host, 'host respondeu em IP diferente da URL');
              if (fixed) cam = fixed;
            }
            // Aprende o MAC (uma vez) a partir do host que respondeu — base da auto-cura.
            if (!cam.mac && result.host) {
              const mac = await getMacForIp(result.host);
              if (mac) {
                const withMac = updateCamera(cam.id, { mac });
                if (withMac) cam = withMac;
              }
            }
          } else if (cam.mac) {
            // Offline: tenta reencontrar o IP pelo MAC e re-testa.
            const healed = await this.tryHeal(cam);
            if (healed) {
              cam = healed;
              result = await testConnection(cam);
            }
          }

          const status: CameraStatus = result.success ? 'online' : 'offline';
          if (status !== camera.status) {
            updateCamera(cam.id, { status });
            if (status === 'offline') {
              insertCameraLog(
                cam.id,
                cam.name,
                'warn',
                `Câmera "${cam.name}" ficou OFF-line`,
                `Câmera: ${cam.name}\nHost: ${this.streamHost(cam)}:${cam.port}\nIP no cadastro: ${cam.ip}\nProtocolo: ${cam.protocol}\nUsuário: ${cam.username || '—'}\nURL principal: ${(cam.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nURL secundária: ${(cam.subStreamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nMAC: ${cam.mac || '—'}\nErro: ${result.error || 'Conexão TCP falhou'}\n\nMonitoramento automático a cada 15s. Se o IP mudou (DHCP), o app tenta reencontrar a câmera pelo MAC.`,
                'connectionMonitor',
              );
            } else {
              insertCameraLog(
                cam.id,
                cam.name,
                'info',
                `Câmera "${cam.name}" está ON-line novamente`,
                `Câmera: ${cam.name}\nHost: ${this.streamHost(cam)}:${cam.port}\nLatência: ${result.latency || '—'}ms\n\nA câmera voltou a responder. Retomando gravação 24/7, detecção e outras operações automáticas.`,
                'connectionMonitor',
              );
            }
          }
          this.notifier?.({ cameraId: cam.id, status });
        }),
      );
    } finally {
      this.checking = false;
    }
  }
}

export const connectionMonitor = new ConnectionMonitor();
