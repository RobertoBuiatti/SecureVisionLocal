import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { app } from 'electron';
import type { Camera, PTZCommand, ServerInfo } from '../../src/shared/types';
import { listCameras, getCamera } from '../core/cameraRepository';
import { listRecordings, getRecording } from '../core/recordingRepository';
import { controlPtz } from '../core/ptz';
import { recordingService } from '../core/recording';
import { getSystemStatus } from '../core/system';
import { getSettings, updateSettings } from '../core/settings';
import { getLanIPv4 } from '../core/network';
import { hlsManager } from './hlsManager';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
};

// Oculta credenciais embutidas numa URL RTSP (rtsp://user:senha@host → rtsp://host).
function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/^((?:rtsp|rtsps|http|https|rtmp):\/\/)[^@/]+@/i, '$1');
}

// Remove a senha e as credenciais embutidas nas URLs antes de enviar pela rede.
// O cliente (app mobile) consome o vídeo via HLS deste servidor, não via RTSP direto.
function publicCamera(cam: Camera) {
  const { password, ...rest } = cam;
  void password;
  return {
    ...rest,
    streamUrl: redactUrl(rest.streamUrl) ?? rest.streamUrl,
    subStreamUrl: redactUrl(rest.subStreamUrl),
  };
}

// Comparação de token em tempo constante (via hash, para aceitar tamanhos diferentes).
function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// Valida o corpo do comando PTZ recebido pela rede (não confia no cast do JSON).
function parsePtzCommand(body: unknown): PTZCommand | null {
  if (!body || typeof body !== 'object') return null;
  const cmd = body as Record<string, unknown>;
  const actions = ['move', 'stop', 'zoom-in', 'zoom-out', 'goto-preset'];
  const directions = [
    'up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right',
  ];
  if (typeof cmd.action !== 'string' || !actions.includes(cmd.action)) return null;
  if (cmd.direction !== undefined && (typeof cmd.direction !== 'string' || !directions.includes(cmd.direction))) {
    return null;
  }
  if (cmd.speed !== undefined && typeof cmd.speed !== 'number') return null;
  if (cmd.presetToken !== undefined && typeof cmd.presetToken !== 'string') return null;
  return {
    action: cmd.action as PTZCommand['action'],
    direction: cmd.direction as PTZCommand['direction'],
    speed: typeof cmd.speed === 'number' ? Math.max(0, Math.min(100, cmd.speed)) : undefined,
    presetToken: cmd.presetToken as string | undefined,
  };
}

function getOrCreateToken(): string {
  const s = getSettings();
  if (s.serverToken) return s.serverToken;
  const token = randomUUID().replace(/-/g, '');
  updateSettings({ serverToken: token });
  return token;
}

// Servidor local: API REST + streaming (HLS) para o app mobile e navegador na LAN.
export class LocalServer {
  private server: Server | null = null;
  private running = false;

  start(): void {
    const settings = getSettings();
    if (!settings.serverEnabled || this.running) return;
    const token = getOrCreateToken();

    this.server = createServer((req, res) => this.handle(req, res, token));
    this.server.on('error', () => {
      this.running = false;
    });
    this.server.listen(settings.serverPort, '0.0.0.0', () => {
      this.running = true;
    });
    hlsManager.start();
  }

  stop(): void {
    hlsManager.stop();
    this.server?.close();
    this.server = null;
    this.running = false;
  }

  // Reinicia o servidor após mudança de configuração (porta/ativação).
  applySettings(): void {
    this.stop();
    this.start();
  }

  getInfo(): ServerInfo {
    const s = getSettings();
    return {
      enabled: s.serverEnabled,
      running: this.running,
      port: s.serverPort,
      token: s.serverToken,
      urls: getLanIPv4().map((ip) => `http://${ip}:${s.serverPort}`),
    };
  }

  private handle(req: IncomingMessage, res: ServerResponse, token: string): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    // Rota pública de verificação.
    if (path === '/api/health') {
      return this.json(res, 200, { ok: true, name: 'SecureVision Local', version: app.getVersion() });
    }

    // Autenticação por token (header Bearer ou ?token= para players de mídia).
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const provided = auth || url.searchParams.get('token');
    if (!tokenMatches(provided, token)) {
      return this.json(res, 401, { error: 'Token inválido ou ausente' });
    }

    this.route(req, res, url, token).catch(() => {
      if (!res.headersSent) this.json(res, 500, { error: 'Erro interno' });
    });
  }

  private async route(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    token: string,
  ): Promise<void> {
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/api/system/status') {
      return this.json(res, 200, getSystemStatus());
    }
    if (method === 'GET' && path === '/api/cameras') {
      return this.json(res, 200, { cameras: listCameras().map(publicCamera) });
    }
    if (method === 'GET' && path === '/api/recordings') {
      const cameraId = url.searchParams.get('cameraId') ?? undefined;
      return this.json(res, 200, { recordings: listRecordings(cameraId) });
    }

    // /api/cameras/:id...
    const camMatch = path.match(/^\/api\/cameras\/([^/]+)(\/.*)?$/);
    if (camMatch) {
      const camera = getCamera(camMatch[1]);
      if (!camera) return this.json(res, 404, { error: 'Câmera não encontrada' });
      const sub = camMatch[2] ?? '';

      if (method === 'GET' && sub === '') return this.json(res, 200, publicCamera(camera));
      if (method === 'POST' && sub === '/ptz') {
        const cmd = parsePtzCommand(await this.readJson(req));
        if (!cmd) return this.json(res, 400, { error: 'Comando PTZ inválido' });
        const ok = await controlPtz(camera, cmd);
        return this.json(res, 200, { ok });
      }
      if (method === 'POST' && sub === '/recording/start') {
        const rec = recordingService.start(camera, 'manual');
        return this.json(res, 200, rec);
      }
      if (method === 'POST' && sub === '/recording/stop') {
        recordingService.stop(camera.id);
        return this.json(res, 200, { ok: true });
      }
    }

    // /api/recordings/:id/file → download/stream do MP4
    const recMatch = path.match(/^\/api\/recordings\/([^/]+)\/file$/);
    if (method === 'GET' && recMatch) {
      const rec = getRecording(recMatch[1]);
      if (!rec || !existsSync(rec.filePath)) {
        return this.json(res, 404, { error: 'Gravação não encontrada' });
      }
      return this.streamFile(req, res, rec.filePath);
    }

    // /api/live/:id/index.m3u8 e segmentos .ts (HLS)
    const liveMatch = path.match(/^\/api\/live\/([^/]+)\/(.+)$/);
    if (method === 'GET' && liveMatch) {
      return this.serveHls(res, liveMatch[1], liveMatch[2], token);
    }

    this.json(res, 404, { error: 'Rota não encontrada' });
  }

  // Inicia/serve o HLS de uma câmera. Reescreve o playlist para propagar o token.
  private async serveHls(
    res: ServerResponse,
    cameraId: string,
    file: string,
    token: string,
  ): Promise<void> {
    const camera = getCamera(cameraId);
    if (!camera) return this.json(res, 404, { error: 'Câmera não encontrada' });

    const dir = hlsManager.ensureSession(camera);
    hlsManager.touch(cameraId);
    const target = join(dir, basename(file));

    if (file.endsWith('.m3u8')) {
      // Aguarda o playlist ser gerado pelo FFmpeg (até ~8s).
      const playlist = await this.waitForFile(target, 8000);
      if (!playlist) return this.json(res, 503, { error: 'Stream iniciando, tente novamente' });
      const rewritten = readFileSync(target, 'utf-8')
        .split('\n')
        .map((line) => (line && !line.startsWith('#') ? `${line}?token=${token}` : line))
        .join('\n');
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.m3u8'] });
      return void res.end(rewritten);
    }

    if (!existsSync(target)) return this.json(res, 404, { error: 'Segmento indisponível' });
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.ts'] });
    createReadStream(target).pipe(res);
  }

  private async waitForFile(path: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (existsSync(path)) return true;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200));
    }
    return existsSync(path);
  }

  // Entrega um arquivo com suporte a Range (necessário para players de vídeo).
  private streamFile(req: IncomingMessage, res: ServerResponse, filePath: string): void {
    const stat = statSync(filePath);
    const range = req.headers.range;
    const type = CONTENT_TYPES['.mp4'];

    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const startByte = m ? Number(m[1]) : 0;
      const endByte = m && m[2] ? Number(m[2]) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${startByte}-${endByte}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': endByte - startByte + 1,
        'Content-Type': type,
      });
      createReadStream(filePath, { start: startByte, end: endByte }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type });
      createReadStream(filePath).pipe(res);
    }
  }

  private json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private readJson(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });
  }
}

export const localServer = new LocalServer();
