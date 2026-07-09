import { spawn, type ChildProcess } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { FFMPEG_PATH } from './ffmpegPath';
import { hwaccelArgs } from './hwaccel';
import { isSafeStreamUrl } from './urlGuard';
import { injectCredentials } from './onvifInfo';
import type { Camera, StreamInfo } from '../../src/shared/types';

const RECONNECT_DELAY_MS = 3000;
// Faixa de portas dos WebSockets de vídeo. Bind SOMENTE em loopback: o consumidor é o
// jsmpeg do próprio renderer (ws://localhost). Expor na LAN vazaria o vídeo sem token.
const WS_HOST = '127.0.0.1';
const WS_PORT_MIN = 9100;
const WS_PORT_MAX = 9400;
const STALL_TIMEOUT_MS = 8000; // sem novos quadros por mais que isto = travado → reinicia
const WATCHDOG_INTERVAL_MS = 3000; // frequência de checagem do travamento

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
  lastDataAt: number; // instante do último quadro recebido (para o watchdog de travamento)
  watchdog?: ReturnType<typeof setInterval>;
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

    const { wss, wsPort } = await this.listenOnFreePort();

    const state: ActiveStream = {
      cameraId: camera.id,
      wsPort,
      wss,
      ffmpeg: null,
      gotData: false,
      stopping: false,
      camera,
      quality,
      lastDataAt: Date.now(),
    };
    this.streams.set(camera.id, state);
    this.spawnCameraFfmpeg(state);
    this.startWatchdog(state);
    return { cameraId: camera.id, wsPort, status: 'starting' };
  }

  // Vigia o fluxo de quadros: se o FFmpeg parar de enviar dados (mas continuar vivo —
  // típico de um congelamento por hiccup do RTSP), reinicia o processo. Sem isto o
  // vídeo "trava" no último quadro porque o evento 'close' nunca dispara.
  private startWatchdog(state: ActiveStream): void {
    if (state.watchdog) return;
    state.watchdog = setInterval(() => {
      if (state.stopping || !state.ffmpeg || state.reconnectTimer) return;
      if (Date.now() - state.lastDataAt > STALL_TIMEOUT_MS) {
        this.notifier?.({
          cameraId: state.cameraId,
          status: 'error',
          error: 'Vídeo travou. Reiniciando…',
        });
        this.restartStalled(state);
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  // Reinicia o FFmpeg de um stream travado sem disparar a reconexão dupla do 'close'.
  private restartStalled(state: ActiveStream): void {
    const old = state.ffmpeg;
    state.ffmpeg = null;
    if (old) {
      old.removeAllListeners('close');
      old.removeAllListeners('error');
      try {
        old.kill('SIGKILL');
      } catch {
        /* noop */
      }
    }
    state.gotData = false;
    this.spawnCameraFfmpeg(state); // reinicia já (sem esperar o backoff)
  }

  // (Re)cria o processo FFmpeg de uma câmera, reaproveitando o mesmo WebSocket.
  private spawnCameraFfmpeg(state: ActiveStream): void {
    if (state.stopping || !state.camera) return;
    state.lastDataAt = Date.now(); // dá ao novo processo uma janela cheia antes do watchdog agir
    const camera = state.camera;
    const rawUrl =
      state.quality === 'low' && camera.subStreamUrl ? camera.subStreamUrl : camera.streamUrl;
    const url = injectCredentials(rawUrl, camera.username, camera.password);
    if (!isSafeStreamUrl(url)) {
      this.notifier?.({
        cameraId: state.cameraId,
        status: 'error',
        error: 'URL de stream inválida — edite a câmera.',
      });
      return;
    }
    const scale = state.quality === 'high' ? '1280:-1' : '640:-1';
    const bitrate = state.quality === 'high' ? '2500k' : '1000k';

    const args = [
      ...hwaccelArgs(),
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
    ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
      // Falha ao iniciar o processo (ex.: binário não encontrado). Nesse caso o
      // evento 'close' pode não disparar, então tratamos o erro e reconectamos aqui.
      console.error(`[streaming] Falha ao iniciar FFmpeg (${FFMPEG_PATH}):`, err);
      if (state.stopping) return;
      const msg =
        err?.code === 'ENOENT'
          ? 'FFmpeg não encontrado — reinstale o aplicativo.'
          : 'Falha ao iniciar o vídeo. Reconectando…';
      this.notifier?.({ cameraId: state.cameraId, status: 'error', error: msg });
      if (!state.reconnectTimer) {
        state.reconnectTimer = setTimeout(() => {
          state.reconnectTimer = undefined;
          this.spawnCameraFfmpeg(state);
        }, RECONNECT_DELAY_MS);
      }
    });
    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      state.lastDataAt = Date.now(); // alimenta o watchdog (chegou quadro novo)
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
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = undefined; // libera o watchdog após a reconexão
        this.spawnCameraFfmpeg(state);
      }, RECONNECT_DELAY_MS);
    });
  }

  // Reproduz um ARQUIVO de gravação pelo mesmo pipeline (sem reconexão).
  async startFile(playKey: string, filePath: string): Promise<StreamInfo> {
    const existing = this.streams.get(playKey);
    if (existing) return { cameraId: playKey, wsPort: existing.wsPort, status: 'running' };

    const { wss, wsPort } = await this.listenOnFreePort();

    const args = [
      ...hwaccelArgs(),
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
      lastDataAt: Date.now(),
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
    if (stream.watchdog) clearInterval(stream.watchdog);
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

  // Abre um WebSocketServer numa porta livre da faixa (testando de verdade o bind).
  // Antes as portas eram incrementadas às cegas e erros de "porta ocupada" eram
  // engolidos — o stream falhava em silêncio. Aqui, porta ocupada → tenta a próxima.
  private async listenOnFreePort(): Promise<{ wss: WebSocketServer; wsPort: number }> {
    const range = WS_PORT_MAX - WS_PORT_MIN + 1;
    let lastError: Error = new Error('sem portas livres');
    for (let attempt = 0; attempt < range; attempt++) {
      const wsPort = this.nextPort;
      this.nextPort = this.nextPort >= WS_PORT_MAX ? WS_PORT_MIN : this.nextPort + 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        const wss = await new Promise<WebSocketServer>((resolve, reject) => {
          const server = new WebSocketServer({
            host: WS_HOST,
            port: wsPort,
            perMessageDeflate: false,
          });
          server.once('listening', () => resolve(server));
          server.once('error', (err) => {
            try {
              server.close();
            } catch {
              /* noop */
            }
            reject(err);
          });
        });
        return { wss, wsPort };
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw lastError;
  }
}

export const streamingService = new StreamingService();
