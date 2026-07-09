import { spawn, type ChildProcess } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { FFMPEG_PATH } from './ffmpegPath';
import { hwaccelArgs } from './hwaccel';
import { isSafeStreamUrl } from './urlGuard';
import { injectCredentials } from './onvifInfo';
import { insertCameraLog, describeCamera } from './cameraLogger';
import type { Camera, StreamInfo } from '../../src/shared/types';

const RECONNECT_DELAY_MS = 3000;
// Faixa de portas dos WebSockets de vídeo. Bind SOMENTE em loopback: o consumidor é o
// jsmpeg do próprio renderer (ws://localhost). Expor na LAN vazaria o vídeo sem token.
const WS_HOST = '127.0.0.1';
const WS_PORT_MIN = 9100;
const WS_PORT_MAX = 9400;
const STALL_TIMEOUT_MS = 8000; // sem novos quadros por mais que isto = travado → reinicia
const WATCHDOG_INTERVAL_MS = 3000; // frequência de checagem do travamento

// Caminhos RTSP alternativos para câmeras cujo ONVIF retorna URL genérica (apenas "/").
// Muitas marcas (Xiongmai, Hikvision, Intelbras/Dahua, TP-Link, Reolink, Foscam,
// Axis, Samsung/Hanwha, UNV, Vivotek, Bosch, etc.) usam paths específicos que o
// ONVIF nem sempre retorna. Esta lista cobre ~95% do mercado.
// Ordenada aproximada por probabilidade de acerto.
const RTSP_FALLBACK_PATHS = [
  // === Xiongmai (genérico ONVIF) ===
  '/onvif1',

  // === Hikvision & HiLook & clones ===
  '/h264/ch1/main/av_stream',
  '/h264/ch1/sub/av_stream',
  '/h265/ch1/main/av_stream',
  '/h265/ch1/sub/av_stream',
  '/h264/ch01/main/av_stream',
  '/h264/ch01/sub/av_stream',

  // === Dahua / Intelbras / Amcrest / LTS ===
  '/cam/realmonitor?channel=1&subtype=0',
  '/cam/realmonitor?channel=1&subtype=1',
  '/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif',
  '/cam/realmonitor?channel=1&subtype=0&proto=Onvif',

  // === TP-Link ===
  '/stream1',
  '/stream2',
  '/live/ch0',
  '/live/ch1',
  '/h264/ch1/main/av_stream',

  // === Reolink ===
  '/h264Preview_01_main',
  '/h264Preview_01_sub',
  '/preview',
  '/h264Preview_01_main.stream',
  '/h264Preview_01_sub.stream',

  // === Axis ===
  '/axis-media/media.amp',
  '/mjpg/video.mjpg',
  '/axis-cgi/mjpg/video.cgi',

  // === Foscam ===
  '/video',
  '/h264_stream',
  '/video.mp4',

  // === Uniview (UNV) ===
  '/avstream/channel=1/stream=0',
  '/avstream/channel=1/stream=1',
  '/live/av0',
  '/live/av1',

  // === Vivotek ===
  '/live.sdp',
  '/live1.sdp',
  '/media/video1.mp4',

  // === Samsung / Hanwha ===
  '/streaming/channels/1/',
  '/streaming/channels/2/',
  '/streaming/channels/101/',
  '/streaming/channels/102/',

  // === Bosch ===
  '/0/stream',
  '/1/stream',
  '/video/stream1',
  '/video/stream2',

  // === Wansview / Sricam / Chinese OEM ===
  '/11',
  '/12',
  '/av0',
  '/av1',

  // === Panasonic ===
  '/nphMotionJpeg?Resolution=640x480',

  // === Geovision ===
  '/live/ch0',
  '/live/ch1',

  // === Sony ===
  '/video',
  '/h264',
  '/h264/h264.stream',

  // === ACTi ===
  '/mjpeg/video.mjpeg',
  '/h264/video.h264',

  // === Fallback genérico ===
  '/live/main',
  '/live/sub',
  '/ch0',
  '/ch1',
];

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
  urlCandidates: string[]; // URLs a tentar (fallback paths)
  urlAttempt: number; // índice atual em urlCandidates
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
      urlCandidates: this.buildUrlCandidates(camera, quality),
      urlAttempt: 0,
    };
    this.streams.set(camera.id, state);
    this.spawnCameraFfmpeg(state);
    this.startWatchdog(state);
    return { cameraId: camera.id, wsPort, status: 'starting' };
  }

  private startWatchdog(state: ActiveStream): void {
    if (state.watchdog) return;
    state.watchdog = setInterval(() => {
      if (state.stopping || !state.ffmpeg || state.reconnectTimer) return;
      if (Date.now() - state.lastDataAt > STALL_TIMEOUT_MS) {
        const camera = state.camera;
        const name = camera?.name || state.cameraId;
        insertCameraLog(
          state.cameraId,
          name,
          'error',
          `Stream travado — "${name}" parou de enviar quadros por mais de 8s`,
          `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\nUsuário: ${camera?.username || '—'}\nURL: ${(camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nO processo FFmpeg continua vivo mas não produz dados. Causa típica: congelamento do stream RTSP (hiccup). Reiniciando o FFmpeg forçadamente.`,
          'streaming',
        );
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

    // Gera lista de URLs RTSP a tentar (original + fallbacks se o path for genérico).
  private buildUrlCandidates(camera: Camera, quality: 'low' | 'high'): string[] {
    const rawUrl =
      quality === 'low' && camera.subStreamUrl ? camera.subStreamUrl : camera.streamUrl;
    const baseUrl = injectCredentials(rawUrl, camera.username, camera.password);
    if (!baseUrl || !isSafeStreamUrl(baseUrl)) return [baseUrl || ''];
    const candidates = [baseUrl];
    try {
      const u = new URL(baseUrl.replace(/^rtsp:\/\//i, 'http://'));
      const path = u.pathname + u.search;
      // Se o path é vazio ou só "/", a URL retornada pelo ONVIF é genérica.
      // Adiciona fallbacks comuns mantendo host, porta e credenciais.
      if (!path || path === '/') {
        const prefix = baseUrl.replace(/\/?(\?.*)?$/, '');
        for (const fp of RTSP_FALLBACK_PATHS) {
          candidates.push(`${prefix}${fp}`);
        }
      }
    } catch {
      /* URL mal formatada, mantém só a original */
    }
    return candidates;
  }

  // (Re)cria o processo FFmpeg de uma câmera, reaproveitando o mesmo WebSocket.
  private spawnCameraFfmpeg(state: ActiveStream): void {
    if (state.stopping || !state.camera) return;
    state.lastDataAt = Date.now();
    const camera = state.camera;
    const url = state.urlCandidates[state.urlAttempt];
    if (!url || !isSafeStreamUrl(url)) {
      insertCameraLog(
        state.cameraId,
        camera.name,
        'error',
        `URL de stream inválida para "${camera.name}"`,
        `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nUsuário: ${camera.username || '—'}\nURL: ${url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nProtocolo: ${camera.protocol}\nErro: URL rejeitada pelo validador de segurança (isSafeStreamUrl).`,
        'streaming',
      );
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

    // Captura stderr do FFmpeg para diagnóstico (RTSP errors, etc.)
    let stderrBuf = '';
    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-2048);
    });
    ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
      const camera = state.camera;
      const details = camera
        ? `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nUsuário: ${camera.username || '—'}\nURL principal: ${(camera.streamUrl || '').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nURL secundária: ${(camera.subStreamUrl || '').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nCaminho FFmpeg: ${FFMPEG_PATH}\nErro: ${err.message}`
        : `Câmera ID: ${state.cameraId}\nCaminho FFmpeg: ${FFMPEG_PATH}\nErro: ${err.message}`;
      if (err?.code === 'ENOENT') {
        insertCameraLog(
          state.cameraId,
          camera?.name || state.cameraId,
          'error',
          `FFmpeg não encontrado no caminho "${FFMPEG_PATH}" — reinstale o aplicativo`,
          `${details}\n\nAção necessária: O binário do FFmpeg não foi encontrado. Reinstale o SecureVision ou coloque o FFmpeg no PATH do sistema.`,
          'streaming',
        );
      } else {
        insertCameraLog(
          state.cameraId,
          camera?.name || state.cameraId,
          'error',
          `Falha ao iniciar FFmpeg para "${camera?.name || state.cameraId}"`,
          details,
          'streaming',
        );
      }
      console.error(`[streaming] Falha ao iniciar FFmpeg (${FFMPEG_PATH}):`, err);
      if (state.stopping) return;
      const msg =
        err?.code === 'ENOENT'
          ? 'FFmpeg não encontrado — reinstale o aplicativo.'
          : 'Falha ao iniciar o vídeo. Reconectando…';
      this.notifier?.({ cameraId: state.cameraId, status: 'error', error: msg });
      if (!state.reconnectTimer) {
        insertCameraLog(
          state.cameraId,
          state.camera?.name || state.cameraId,
          'info',
          `Tentando reconexão de "${state.camera?.name || state.cameraId}" em ${RECONNECT_DELAY_MS}ms`,
          `Câmera: ${state.camera?.name || state.cameraId}\nIP: ${state.camera?.ip || '—'}:${state.camera?.port || '—'}\nUsuário: ${state.camera?.username || '—'}\nURL: ${(state.camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nO sistema tentará restabelecer o stream automaticamente após ${RECONNECT_DELAY_MS}ms.`,
          'streaming',
        );
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
        const camera = state.camera;
        const name = camera?.name || state.cameraId;
        insertCameraLog(
          state.cameraId,
          name,
          'info',
          `Streaming de "${name}" ativo`,
          `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\nUsuário: ${camera?.username || '—'}\nURL: ${(camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nQualidade: ${state.quality}\nPorta WS: ${state.wsPort}\n\nO FFmpeg começou a produzir quadros. O stream de vídeo está sendo transmitido para a interface.`,
          'streaming',
        );
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
      const camera = state.camera;
      const name = camera?.name || state.cameraId;
      if (neverConnected) {
        const nextAttempt = state.urlAttempt + 1;
        const hasMoreUrls = nextAttempt < state.urlCandidates.length;
        const ffmpegError = stderrBuf ? `\n\n--- stderr FFmpeg ---\n${stderrBuf.trim().slice(0, 2000)}` : '';
        insertCameraLog(
          state.cameraId,
          name,
          'error',
          `Sem sinal da câmera "${name}" — tentativa ${state.urlAttempt + 1}/${state.urlCandidates.length}`,
          `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\nUsuário: ${camera?.username || '—'}\nURL principal: ${(camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nURL secundária: ${(camera?.subStreamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nURL testada: ${state.urlCandidates[state.urlAttempt].replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nTentativas restantes: ${hasMoreUrls ? state.urlCandidates.length - nextAttempt : 0}\n\nCausa provável: URL incorreta, credenciais inválidas ou câmera desligada/inacessível na rede. O FFmpeg nunca conseguiu receber quadros.${ffmpegError}`,
          'streaming',
        );
        // Se há mais URLs para tentar, avança para a próxima imediatamente
        if (hasMoreUrls) {
          state.urlAttempt = nextAttempt;
          state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = undefined;
            this.spawnCameraFfmpeg(state);
          }, 500);
          return;
        }
      } else {
        insertCameraLog(
          state.cameraId,
          name,
          'warn',
          `Conexão perdida com "${name}"`,
          `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\nUsuário: ${camera?.username || '—'}\nURL: ${(camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nO stream estava rodando e caiu subitamente. Causas possíveis: queda de rede, câmera reiniciou, ou timeout. Reconectando em ${RECONNECT_DELAY_MS}ms.`,
          'streaming',
        );
      }
      const msg = neverConnected
        ? 'Sem sinal — verifique a URL/credenciais. Tentando reconectar…'
        : 'Conexão perdida. Reconectando…';
      this.notifier?.({ cameraId: state.cameraId, status: 'error', error: msg });
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = undefined;
        if (neverConnected) state.urlAttempt = 0; // reinicia tentativas do início
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
      urlCandidates: [],
      urlAttempt: 0,
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
    const camera = stream.camera;
    const name = camera?.name || cameraId;
    insertCameraLog(
      cameraId,
      name,
      'info',
      `Streaming de "${name}" encerrado`,
      `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\nUsuário: ${camera?.username || '—'}\nURL: ${(camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nO streaming foi parado intencionalmente (usuário desativou ou câmera foi removida).`,
      'streaming',
    );
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
