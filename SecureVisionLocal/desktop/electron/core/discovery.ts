import { createConnection } from 'node:net';
import type { DiscoveredCamera } from '../../src/shared/types';
import { getLanSubnets } from './network';

// O pacote `onvif` é CommonJS e sem tipos; tratamos como any de forma defensiva.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as onvifNs from 'onvif';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onvif: any = (onvifNs as any).default ?? onvifNs;

// Portas de stream RTSP (uma porta RTSP aberta indica fortemente uma câmera).
const RTSP_PORTS = [554, 8554];

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

// 1) Descoberta ONVIF via WS-Discovery (multicast). Melhor esforço.
function onvifProbe(timeoutMs: number): Promise<DiscoveredCamera[]> {
  return new Promise((resolve) => {
    const found: DiscoveredCamera[] = [];
    try {
      if (!onvif?.Discovery?.probe) {
        resolve(found);
        return;
      }
      onvif.Discovery.probe({ timeout: timeoutMs, resolve: false }, (err: unknown, cams: unknown[]) => {
        if (err || !Array.isArray(cams)) {
          resolve(found);
          return;
        }
        for (const cam of cams) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = cam as any;
          const hostname: string | undefined = c?.hostname || c?.address;
          if (!hostname) continue;
          found.push({
            ip: hostname,
            port: c?.port ?? 80,
            name: c?.name,
            manufacturer: c?.manufacturer,
            model: c?.model,
            onvifUrl: Array.isArray(c?.xaddrs) ? c.xaddrs[0] : c?.xaddrs,
            source: 'onvif',
          });
        }
        resolve(found);
      });
    } catch {
      resolve(found);
    }
  });
}

// 2) Varredura TCP da sub-rede APENAS em portas RTSP (evita falsos positivos
// de serviços HTTP comuns como 80/8080 de gateways/WSL).
async function scanSubnet(subnet: string, timeoutMs: number): Promise<DiscoveredCamera[]> {
  const results: DiscoveredCamera[] = [];
  const concurrency = 64;
  const hosts: number[] = [];
  for (let i = 1; i <= 254; i++) hosts.push(i);

  let index = 0;
  async function worker() {
    while (index < hosts.length) {
      const i = hosts[index++];
      const ip = `${subnet}.${i}`;
      for (const port of RTSP_PORTS) {
        // eslint-disable-next-line no-await-in-loop
        const open = await probeTcp(ip, port, timeoutMs);
        if (open) {
          results.push({
            ip,
            port,
            rtspUrls: [`rtsp://${ip}:${port}/`],
            source: 'scan',
          });
          break;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export interface DiscoverOptions {
  timeoutMs?: number;
  subnet?: string;
}

// Combina ONVIF + varredura RTSP da(s) sub-rede(s) reais e remove duplicados por IP.
export async function discover(opts: DiscoverOptions = {}): Promise<DiscoveredCamera[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const subnets = opts.subnet ? [opts.subnet] : getLanSubnets();

  const [onvifResults, ...scanResults] = await Promise.all([
    onvifProbe(timeoutMs),
    ...subnets.slice(0, 3).map((s) => scanSubnet(s, 600)), // limita a 3 sub-redes
  ]);

  const byIp = new Map<string, DiscoveredCamera>();
  for (const cam of scanResults.flat()) byIp.set(cam.ip, cam);
  for (const cam of onvifResults) byIp.set(cam.ip, cam); // ONVIF tem prioridade
  return Array.from(byIp.values());
}
