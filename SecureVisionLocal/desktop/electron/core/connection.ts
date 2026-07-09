import { createConnection } from 'node:net';
import type { Camera, ConnectionTestResult } from '../../src/shared/types';
import { insertCameraLog, describeCamera } from './cameraLogger';

// Testa a conectividade TCP até a porta da câmera (RTSP/ONVIF/HTTP) e mede latência.
export function testConnection(camera: Camera, timeoutMs = 4000): Promise<ConnectionTestResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = createConnection({ host: camera.ip, port: camera.port });
    let settled = false;

    const finish = (result: ConnectionTestResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const lat = Date.now() - start;
      insertCameraLog(
        camera.id,
        camera.name,
        'info',
        `Conexão TCP com "${camera.name}" OK — ${lat}ms`,
        `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nLatência: ${lat}ms\nProtocolo: ${camera.protocol}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`,
        'connection',
      );
      finish({ success: true, latency: lat, error: null, timestamp: Date.now() });
    });
    socket.on('timeout', () => {
      insertCameraLog(
        camera.id,
        camera.name,
        'error',
        `Timeout ao conectar em "${camera.name}" — IP ${camera.ip}:${camera.port} não respondeu em ${timeoutMs}ms`,
        `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nProtocolo: ${camera.protocol}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nA câmera não respondeu à conexão TCP dentro do prazo de ${timeoutMs}ms. Verifique:\n1. Se a câmera está ligada\n2. Se o IP ${camera.ip} está correto\n3. Se a porta ${camera.port} é a porta de serviço correta\n4. Se não há firewall/bloqueio entre o PC e a câmera`,
        'connection',
      );
      finish({ success: false, latency: null, error: 'Tempo esgotado', timestamp: Date.now() });
    });
    socket.on('error', (err) => {
      insertCameraLog(
        camera.id,
        camera.name,
        'error',
        `Erro de conexão com "${camera.name}": ${err.message}`,
        `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nProtocolo: ${camera.protocol}\nUsuário: ${camera.username || '—'}\nURL: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nDetalhes do erro de socket: ${err.message}`,
        'connection',
      );
      finish({ success: false, latency: null, error: err.message, timestamp: Date.now() });
    });
  });
}
