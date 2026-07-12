import { createConnection } from 'node:net';
import type { Camera, ConnectionTestResult } from '../../src/shared/types';
import { insertCameraLog } from './cameraLogger';
import { rtspHostPort } from './ipResolver';

// Hosts candidatos a testar, do mais provável ao menos: o host da URL de stream (o
// mesmo que o FFmpeg conecta) e o IP do cadastro. Com DHCP no WiFi os dois podem
// divergir durante uma troca de IP; testar ambos evita falso "offline".
function candidateTargets(camera: Camera): Array<{ host: string; port: number }> {
  const list: Array<{ host: string; port: number }> = [];
  const seen = new Set<string>();
  const add = (host?: string, port?: number): void => {
    if (!host) return;
    const key = `${host}:${port ?? camera.port}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ host, port: port ?? camera.port });
  };
  const main = camera.streamUrl ? rtspHostPort(camera.streamUrl) : null;
  const sub = camera.subStreamUrl ? rtspHostPort(camera.subStreamUrl) : null;
  add(main?.host, main?.port);
  add(sub?.host, sub?.port);
  add(camera.ip, camera.port);
  return list;
}

// Tenta conectar (TCP) num host:porta. Resolve com a latência ou null (falha).
function probeHost(host: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (lat: number | null): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(lat);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(Date.now() - start));
    socket.on('timeout', () => finish(null));
    socket.on('error', () => finish(null));
  });
}

// Testa a conectividade TCP da câmera e mede latência. Testa os hosts candidatos
// (URL de stream + IP do cadastro) EM PARALELO e considera online se qualquer um
// responder — reportando qual host respondeu (base para a auto-cura por MAC).
// Timeout generoso (9s): em WiFi + câmera saturada, 4s dava falso "offline".
export async function testConnection(
  camera: Camera,
  timeoutMs = 9000,
): Promise<ConnectionTestResult> {
  const targets = candidateTargets(camera);
  const results = await Promise.all(
    targets.map(async (t) => ({ ...t, lat: await probeHost(t.host, t.port, timeoutMs) })),
  );
  const ok = results.find((r) => r.lat !== null);

  if (ok) {
    insertCameraLog(
      camera.id,
      camera.name,
      'info',
      `Conexão TCP com "${camera.name}" OK — ${ok.lat}ms (${ok.host})`,
      `Câmera: ${camera.name}\nHost que respondeu: ${ok.host}:${ok.port}\nIP no cadastro: ${camera.ip}:${camera.port}\nLatência: ${ok.lat}ms\nProtocolo: ${camera.protocol}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`,
      'connection',
    );
    return { success: true, latency: ok.lat, error: null, timestamp: Date.now(), host: ok.host };
  }

  const tested = targets.map((t) => `${t.host}:${t.port}`).join(', ');
  insertCameraLog(
    camera.id,
    camera.name,
    'error',
    `Timeout ao conectar em "${camera.name}" — nenhum host respondeu em ${timeoutMs}ms`,
    `Câmera: ${camera.name}\nHosts testados: ${tested}\nIP no cadastro: ${camera.ip}:${camera.port}\nProtocolo: ${camera.protocol}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nNenhum host candidato respondeu à conexão TCP no prazo. Verifique:\n1. Se a câmera está ligada\n2. Se o IP mudou (DHCP) — o app tenta reencontrar pelo MAC automaticamente\n3. Se a porta ${camera.port} é a porta de serviço correta\n4. Se não há firewall/bloqueio entre o PC e a câmera`,
    'connection',
  );
  return { success: false, latency: null, error: 'Tempo esgotado', timestamp: Date.now() };
}
