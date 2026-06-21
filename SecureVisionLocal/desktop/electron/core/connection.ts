import { createConnection } from 'node:net';
import type { Camera, ConnectionTestResult } from '../../src/shared/types';

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
      finish({ success: true, latency: Date.now() - start, error: null, timestamp: Date.now() });
    });
    socket.on('timeout', () => {
      finish({ success: false, latency: null, error: 'Tempo esgotado', timestamp: Date.now() });
    });
    socket.on('error', (err) => {
      finish({ success: false, latency: null, error: err.message, timestamp: Date.now() });
    });
  });
}
