import { listCameras, getCamera, updateCamera, isDuplicateShadow, cameraDeviceKey, primaryOfGroup } from './cameraRepository';
import { testConnection } from './connection';
import type { Camera, CameraStatus } from '../../src/shared/types';
import { insertCameraLog } from './cameraLogger';
import { getMacForIp, findIpForMac, rtspHostPort, rewriteRtspHost } from './ipResolver';
import { streamingService } from './streaming';
import { detectionManager } from './detectionManager';
import { recordingManager } from './recordingManager';

const CHECK_INTERVAL_MS = 15_000; // ritmo normal quando tudo está online
const FAST_CHECK_MS = 5_000; // ritmo acelerado enquanto houver câmera offline (reencontra o IP novo rápido)
const HEAL_COOLDOWN_MS = 15_000; // auto-cura por MAC no máx. a cada 15s/câmera (IP muda por DHCP)

type Notifier = (p: { cameraId: string; status: CameraStatus }) => void;

// Verifica periodicamente a conectividade de todas as câmeras e atualiza o status.
// Também aprende o MAC de cada câmera e mantém o IP correto quando ele muda (DHCP no
// WiFi): reconcilia a URL para o host que responde e, se a câmera sumir do IP atual,
// a reencontra na rede pelo MAC.
class ConnectionMonitor {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private notifier?: Notifier;
  private checking = false;
  private stopped = false;
  private lastHeal = new Map<string, number>();
  private warnedDupes = new Set<string>();

  start(notifier: Notifier): void {
    this.notifier = notifier;
    if (this.timer) return;
    this.stopped = false;
    // Loop auto-agendado: enquanto houver câmera OFFLINE, checa a cada FAST_CHECK_MS para
    // reencontrar o IP novo (DHCP) rápido; com tudo online, volta ao ritmo normal. Sem IP
    // fixo, isso encurta o corte de vídeo na troca de IP de ~1min para ~poucos segundos.
    const loop = async (): Promise<void> => {
      await this.checkAll();
      if (this.stopped) return;
      const cams = listCameras();
      const anyOffline = cams.some((c) => c.status === 'offline' && !isDuplicateShadow(c, cams));
      this.timer = setTimeout(() => void loop(), anyOffline ? FAST_CHECK_MS : CHECK_INTERVAL_MS);
    };
    void loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
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
      `Câmera: ${camera.name}\nMAC: ${camera.mac || '—'}\nHost antigo: ${oldHost}\nHost novo: ${newHost}\nMotivo: ${reason}\n\nO IP da câmera mudou (DHCP). O app REENCONTROU a câmera pelo MAC e religou streaming, detecção e gravação no novo IP automaticamente. Enquanto há câmera offline, o monitor acelera a verificação (a cada 5s) para minimizar o tempo sem vídeo na troca de IP.`,
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

  // Recura SOB DEMANDA (pedida pelo streaming quando o stream não conecta). Reencontra a
  // câmera pelo MAC mesmo que o IP antigo ainda responda TCP (fantasma). Respeita o
  // cooldown de cura (não varre ARP a cada falha). Se o IP mudou, applyNewHost religa.
  async healNow(cameraId: string): Promise<void> {
    const cam = getCamera(cameraId);
    if (!cam || !cam.mac || isDuplicateShadow(cam)) return;
    await this.tryHeal(cam);
  }

  private async checkAll(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const cameras = listCameras();
      this.warnDuplicates(cameras);
      await Promise.all(
        cameras.map(async (camera) => {
          // Duplicata do mesmo dispositivo: não testa nem cura (evita o ruído .9/.10 e o
          // churn de reinício do stream). Só o cadastro principal é monitorado.
          if (isDuplicateShadow(camera, cameras)) return;
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

  // Loga UMA vez por dispositivo quando há cadastros duplicados da mesma câmera física,
  // orientando a remover os extras. O app já ignora as duplicatas nas puxadas/gravação/
  // detecção (só o cadastro principal fica ativo), o que evita o lag/"Sem sinal".
  private warnDuplicates(cameras: Camera[]): void {
    const byKey = new Map<string, Camera[]>();
    for (const c of cameras) {
      const k = cameraDeviceKey(c);
      if (k.startsWith('id:')) continue;
      const arr = byKey.get(k) ?? [];
      arr.push(c);
      byKey.set(k, arr);
    }
    for (const [k, group] of byKey) {
      if (group.length <= 1 || this.warnedDupes.has(k)) continue;
      this.warnedDupes.add(k);
      const primary = primaryOfGroup(group);
      const extras = group.filter((c) => c.id !== primary.id);
      insertCameraLog(
        primary.id,
        primary.name,
        'warn',
        `Câmera duplicada: ${group.length} cadastros do mesmo dispositivo`,
        `A mesma câmera física está cadastrada ${group.length}x (mesma URL/credenciais; IPs: ${group
          .map((c) => c.ip)
          .join(', ')}).\n\nO app passou a usar SÓ o cadastro principal ("${primary.name}", ${primary.ip}) e a IGNORAR os demais nas puxadas/gravação/detecção — isso evita abrir várias sessões RTSP na mesma câmera (causa de lag e "Sem sinal").\n\nRemova os cadastros extras para limpar a lista: ${extras
          .map((c) => `"${c.name}" (${c.ip})`)
          .join(', ')}.`,
        'connectionMonitor',
      );
    }
  }
}

export const connectionMonitor = new ConnectionMonitor();
