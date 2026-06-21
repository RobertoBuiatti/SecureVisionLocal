import { spawn, type ChildProcess } from 'node:child_process';
import { WebSocketServer } from 'ws';
import ffmpegStatic from 'ffmpeg-static';
import type { Camera, StreamInfo } from '../../src/shared/types';

const FFMPEG_PATH: string = (ffmpegStatic as unknown as string) || 'ffmpeg';
const RECONNECT_DELAY_MS = 3000;

interface ActiveStream {
  cameraId: string;
  wsPort: number;
  wss: WebSocketServer;
  ffmpeg: ChildProcess | null;
  gotData: boolean;
  stopping: boolean;
  camera?: Camera; // presente em streams de câmera (não em reprodução de arquivo)
  quality?: 'low' | 'high';
  isFile?: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

export type StreamStatusEvent = {
  cameraId: string;
  status: 'running' | 'error';
  error?: string;
};
type Notifier = (e: StreamStatusEvent) => void;

// Transcodifica RTSP → MPEG-TS (MPEG1) e transmite por WebSocket para o jsmpeg.
// O WebSocket é mantido vivo; se o FFmpeg cair (queda da câmera), reconecta sozinho.
export class StreamingService {
  private streams = new Map<string, ActiveStream>();
  private nextPort = 9100;
  private notifier?: Notifier;

  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  isActive(cameraId: string): boolean {
    return this.streams.has(cameraId);
  }

  async start(camera: Camera, quality: 'low' | 'high' = 'low'): Promise<StreamInfo> {
    const existing = this.streams.get(camera.id);
    if (existing) {
      existing.camera = camera; // atualiza dados (URL/credenciais) se mudaram
      return {
        cameraId: camera.id,
        wsPort: existing.wsPort,
        status: existing.gotData ? 'running' : 'starting',
      };
    }

    const wsPort = this.allocatePort();
    const wss = new WebSocketServer({ port: wsPort, perMessageDeflate: false });
    await new Promise<void>((resolve) => {
      wss.once('listening', () => resolve());
      wss.once('error', () => resolve());
    });

    const state: ActiveStream = {
      cameraId: camera.id,
      wsPort,
      wss,
      ffmpeg: null,
      gotData: false,
      stopping: false,
      camera,
      quality,
    };
    this.streams.set(camera.id, state);
    this.spawnCameraFfmpeg(state);
    return { cameraId: camera.id, wsPort, status: 'starting' };
  }

  // (Re)cria o processo FFmpeg de uma câmera, reaproveitando o mesmo WebSocket.
  private spawnCameraFfmpeg(state: ActiveStream): void {
    if (state.stopping || !state.camera) return;
    const camera = state.camera;
    const url =
      state.quality === 'low' && camera.subStreamUrl ? camera.subStreamUrl : camera.streamUrl;
    const scale = state.quality === 'high' ? '1280:-1' : '640:-1';
    const bitrate = state.quality === 'high' ? '2500k' : '1000k';

    const args = [
      '-rtsp_transport', 'tcp',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-i', url,
      '-f', 'mpegts',
      '-codec:v', 'mpeg1video',
      '-vf', `scale=${scale}`,
      '-b:v', bitrate,
      '-r', '25',
      '-bf', '0',
      '-an',
      '-q', '1',
      'pipe:1',
    ];

    const ffmpeg = spawn(FFMPEG_PATH, args);
    state.ffmpeg = ffmpeg;
    ffmpeg.on('error', () => {
      /* o evento 'close' cuida da reconexão */
    });
    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      if (!state.gotData) {
        state.gotData = true;
        this.notifier?.({ cameraId: state.cameraId, status: 'running' });
      }
      for (const client of state.wss.clients) {
        if (client.readyState === client.OPEN) client.send(chunk);
      }
    });
    ffmpeg.on('close', () => {
      if (state.stopping) return;
      const neverConnected = !state.gotData;
      state.gotData = false;
      // Notifica erro (UI mostra "sem sinal") e agenda reconexão automática.
      this.notifier?.({
        cameraId: state.cameraId,
        status: 'error',
        error: neverConnected
          ? 'Sem sinal — verifique a URL/credenciais. Tentando reconectar…'
          : 'Conexão perdida. Reconectando…',
      });
      state.reconnectTimer = setTimeout(() => this.spawnCameraFfmpeg(state), RECONNECT_DELAY_MS);
    });
  }

  // Reproduz um ARQUIVO de gravação pelo mesmo pipeline (sem reconexão).
  async startFile(playKey: string, filePath: string): Promise<StreamInfo> {
    const existing = this.streams.get(playKey);
    if (existing) return { cameraId: playKey, wsPort: existing.wsPort, status: 'running' };

    const wsPort = this.allocatePort();
    const wss = new WebSocketServer({ port: wsPort, perMessageDeflate: false });
    await new Promise<void>((resolve) => {
      wss.once('listening', () => resolve());
      wss.once('error', () => resolve());
    });

    const args = [
      '-re',
      '-i', filePath,
      '-f', 'mpegts',
      '-codec:v', 'mpeg1video',
      '-vf', 'scale=854:-1',
      '-b:v', '1500k',
      '-r', '25',
      '-bf', '0',
      '-an',
      '-q', '1',
      'pipe:1',
    ];
    const ffmpeg = spawn(FFMPEG_PATH, args);
    const state: ActiveStream = {
      cameraId: playKey,
      wsPort,
      wss,
      ffmpeg,
      gotData: true,
      stopping: false,
      isFile: true,
    };
    ffmpeg.on('error', () => this.stop(playKey));
    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) client.send(chunk);
      }
    });
    ffmpeg.on('close', () => this.stop(playKey));
    this.streams.set(playKey, state);
    return { cameraId: playKey, wsPort, status: 'running' };
  }

  stop(cameraId: string): void {
    const stream = this.streams.get(cameraId);
    if (!stream) return;
    stream.stopping = true;
    if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
    this.streams.delete(cameraId);
    try {
      stream.ffmpeg?.kill('SIGKILL');
    } catch {
      /* noop */
    }
    try {
      for (const client of stream.wss.clients) client.terminate();
      stream.wss.close();
    } catch {
      /* noop */
    }
  }

  stopAll(): void {
    for (const id of Array.from(this.streams.keys())) this.stop(id);
  }

  private allocatePort(): number {
    const port = this.nextPort;
    this.nextPort += 1;
    if (this.nextPort > 9400) this.nextPort = 9100;
    return port;
  }
}

export const streamingService = new StreamingService();
