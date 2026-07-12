import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { FFMPEG_PATH } from './ffmpegPath';
import { hwaccelArgs } from './hwaccel';
import { isSafeStreamUrl } from './urlGuard';
import { injectCredentials } from './onvifInfo';
import { insertCameraLog } from './cameraLogger';
import { liveFramePath } from './liveFrameCache';
import { aiDetectVf } from './ai/aiDetection';
import type { Camera, StreamInfo, DetectionConfig } from '../../src/shared/types';

// Callbacks para a detecção IA consumir os quadros da puxada única (injetados no main).
type DetectionAttach = (
  camera: Camera,
  config: DetectionConfig,
  stream: NodeJS.ReadableStream,
) => void;
type DetectionDetach = (cameraId: string) => void;

const RECONNECT_DELAY_MS = 3000;
// Faixa de portas dos WebSockets de vídeo. Bind SOMENTE em loopback: o consumidor é o
// jsmpeg do próprio renderer (ws://localhost). Expor na LAN vazaria o vídeo sem token.
const WS_HOST = '127.0.0.1';
const WS_PORT_MIN = 9100;
const WS_PORT_MAX = 9400;
// Timeouts de stall (travamento) por qualidade. High mais tolerante p/ evitar failover prematuro.
const STALL_TIMEOUT_MS = { high: 30000, low: 45000 };
const WATCHDOG_INTERVAL_MS = 3000; // frequência de checagem do travamento
const MAX_STALLS_BEFORE_FAILOVER = 3; // quantos stalls consecutivos em high antes de cair p/ low
// Probe de restauração do HD deliberadamente LENTO: em câmera 8MP via WiFi o HD raramente
// estabiliza, e cada probe abre uma sessão 8MP que satura a rede. Espaçar bastante evita
// que o probe atrapalhe o vídeo/gravação. (Antes: 60s / 30s → agressivo demais.)
const MIN_TIME_IN_LOW_MS = 300_000; // fica no low ao menos 5min antes de tentar voltar ao HD
const PROBE_STABLE_MS = 10_000; // probe no high deve ficar estável 10s antes de confirmar troca
const PROBE_RETRY_BASE_MS = 300_000; // base do backoff se o probe falhar (5min, 10min, 20min…)

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
  quality: 'low' | 'high'; // qualidade ATUAL rodando
  preferredQuality: 'low' | 'high'; // qualidade PREFERIDA pelo usuário
  isFile?: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  failoverTimer?: ReturnType<typeof setTimeout>; // timer para tentar voltar à qualidade preferida
  failoverActive: boolean; // true se fez failover high→low e está aguardando voltar
  lastDataAt: number; // instante do último quadro recebido (para o watchdog de travamento)
  watchdog?: ReturnType<typeof setInterval>;
  urlCandidates: string[]; // URLs a tentar (fallback paths)
  urlAttempt: number; // índice atual em urlCandidates
  stallCount: number; // stalls consecutivos na qualidade atual (reset ao trocar qualidade)
  reconnectCount: number; // tentativas de reconexão consecutivas (para backoff)
  // Probe de estabilidade para voltar ao high
  probeTimer?: ReturnType<typeof setTimeout>;
  probeAttempt: number; // tentativa de probe (para backoff exponencial)
  lowSince?: number; // timestamp quando entrou em low
  // Fonte única: a MESMA puxada alimenta vários usos, decodificando uma vez só.
  viewerActive?: boolean; // há visualização ao vivo ativa
  record?: boolean; // gravar segmentos MP4 desta puxada
  detect?: boolean; // alimentar a detecção IA com os quadros desta puxada
  detectConfig?: DetectionConfig;
  recDir?: string; // diretório dos segmentos de gravação
  segmentSeconds?: number;
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
  private detectionAttach?: DetectionAttach;
  private detectionDetach?: DetectionDetach;

  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  // Injeta como a detecção IA recebe os quadros da puxada única (evita acoplar módulos).
  setDetectionSink(attach: DetectionAttach, detach: DetectionDetach): void {
    this.detectionAttach = attach;
    this.detectionDetach = detach;
  }

  // Verdadeiro se algo ainda precisa da puxada (visualização, gravação ou detecção).
  private stillNeeded(state: ActiveStream): boolean {
    return !!(state.viewerActive || state.record || state.detect);
  }

  isActive(cameraId: string): boolean {
    return this.streams.has(cameraId);
  }

  // Garante a existência do estado + WebSocket da câmera (sem iniciar o FFmpeg ainda).
  private async ensureState(camera: Camera, quality: 'low' | 'high'): Promise<ActiveStream> {
    const existing = this.streams.get(camera.id);
    if (existing) {
      existing.camera = camera; // atualiza dados (URL/credenciais) se mudaram
      return existing;
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
      stallCount: 0,
      probeAttempt: 0,
      lastDataAt: Date.now(),
      urlCandidates: this.buildUrlCandidates(camera, quality),
      urlAttempt: 0,
      preferredQuality: quality,
      failoverActive: false,
      reconnectCount: 0,
      viewerActive: false,
      record: false,
      detect: false,
    };
    this.streams.set(camera.id, state);
    this.startWatchdog(state);
    return state;
  }

  // Visualização ao vivo: anexa um espectador à puxada única (inicia-a se preciso).
  async start(camera: Camera, quality: 'low' | 'high' = 'high'): Promise<StreamInfo> {
    const state = await this.ensureState(camera, quality);
    state.viewerActive = true;
    state.preferredQuality = quality;
    if (state.failoverActive && state.quality === quality) {
      state.failoverActive = false;
      if (state.failoverTimer) {
        clearTimeout(state.failoverTimer);
        state.failoverTimer = undefined;
      }
    }
    if (!state.ffmpeg) this.spawnCameraFfmpeg(state);
    return {
      cameraId: camera.id,
      wsPort: state.wsPort,
      status: state.gotData ? 'running' : 'starting',
    };
  }

  // Espectador saiu: só derruba a puxada se nada mais precisar dela (gravação/detecção).
  viewerStop(cameraId: string): void {
    const state = this.streams.get(cameraId);
    if (!state) return;
    state.viewerActive = false;
    if (!this.stillNeeded(state)) this.stop(cameraId);
  }

  // Liga/desliga a GRAVAÇÃO 24/7 nesta puxada única (segmentos MP4 a partir do mesmo pull).
  async setRecording(
    camera: Camera,
    on: boolean,
    dir: string,
    segmentSeconds: number,
  ): Promise<void> {
    if (!on) {
      const st = this.streams.get(camera.id);
      if (!st || !st.record) return;
      st.record = false;
      if (!this.stillNeeded(st)) this.stop(camera.id);
      else this.reconfigure(st);
      return;
    }
    const st = await this.ensureState(
      camera,
      this.streams.get(camera.id)?.preferredQuality ?? 'high',
    );
    if (st.record && st.recDir === dir) {
      if (!st.ffmpeg) this.spawnCameraFfmpeg(st);
      return; // já gravando neste diretório
    }
    st.record = true;
    st.recDir = dir;
    st.segmentSeconds = segmentSeconds;
    this.reconfigure(st);
  }

  // Liga/desliga a alimentação da DETECÇÃO IA a partir dos quadros desta puxada única.
  async setDetection(camera: Camera, config: DetectionConfig, on: boolean): Promise<void> {
    if (!on) {
      const st = this.streams.get(camera.id);
      if (!st || !st.detect) return;
      st.detect = false;
      st.detectConfig = undefined;
      this.detectionDetach?.(camera.id);
      if (!this.stillNeeded(st)) this.stop(camera.id);
      else this.reconfigure(st);
      return;
    }
    const st = await this.ensureState(
      camera,
      this.streams.get(camera.id)?.preferredQuality ?? 'high',
    );
    const sameConfig = st.detect && JSON.stringify(st.detectConfig) === JSON.stringify(config);
    if (sameConfig) {
      if (!st.ffmpeg) this.spawnCameraFfmpeg(st);
      return;
    }
    st.detect = true;
    st.detectConfig = config;
    this.reconfigure(st);
  }

  // Reinicia o FFmpeg da puxada única para aplicar mudança de saídas (gravação/detecção).
  private reconfigure(state: ActiveStream): void {
    if (state.stopping) return;
    this.detectionDetach?.(state.cameraId); // será reanexada no novo spawn, se ainda ligada
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
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
    this.spawnCameraFfmpeg(state);
  }

  // Atualiza a câmera de um stream em execução (ex.: o IP mudou por DHCP e foi
  // auto-curado). Reconstrói as URLs candidatas e reinicia o FFmpeg para pegar o
  // novo endereço imediatamente, sem esperar o ciclo de reconexão.
  refreshCamera(camera: Camera): void {
    const state = this.streams.get(camera.id);
    if (!state || state.isFile) return;
    state.camera = camera;
    state.urlCandidates = this.buildUrlCandidates(camera, state.quality);
    state.urlAttempt = 0;
    state.reconnectCount = 0;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
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
    this.spawnCameraFfmpeg(state);
  }

  private startWatchdog(state: ActiveStream): void {
    if (state.watchdog) return;
    const quality = state.quality; // agora obrigatório
    const timeout = STALL_TIMEOUT_MS[quality];
    state.watchdog = setInterval(() => {
      if (state.stopping || !state.ffmpeg || state.reconnectTimer) return;
      if (Date.now() - state.lastDataAt > timeout) {
        const camera = state.camera;
        const name = camera?.name || state.cameraId;
        const secs = Math.round(timeout / 1000);
        insertCameraLog(
          state.cameraId,
          name,
          'error',
          `Stream travado — "${name}" parou de enviar quadros por mais de ${secs}s`,
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
    state.stallCount = (state.stallCount || 0) + 1; // conta stalls consecutivos
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
      // Xiongmai e clones usam credenciais no path/query (user=...&password=...).
      // Fallbacks padrão (rtsp://host:port/path) não funcionam sem esse formato proprietário.
      const looksLikeXiongmai = /user\s*=\s*[^&]+.*password\s*=\s*[^&]+/i.test(u.pathname + u.search);
      if (!looksLikeXiongmai) {
        const origin = u.origin; // ex: http://192.168.1.9:554
        const rtspOrigin = origin.replace(/^http:\/\//i, 'rtsp://');
        for (const fp of RTSP_FALLBACK_PATHS) {
          const candidate = `${rtspOrigin}${fp}`;
          if (candidate !== baseUrl) candidates.push(candidate);
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
    const scale = '1280:-1';
    const bitrate = state.quality === 'high' ? '2500k' : '1000k';
    const isLow = state.quality === 'low';

    // FONTE ÚNICA: uma puxada RTSP, decodificada UMA vez, com várias saídas locais.
    const inputArgs = [
      ...hwaccelArgs(),
      '-rtsp_transport', 'tcp',
      '-timeout', '10000000',
      // discardcorrupt: descarta pacotes corrompidos (comuns em WiFi) em vez de travar
      // o decoder. reorder_queue_size > 0 tolera reordenação de pacotes RTP (o valor 0
      // fazia qualquer reordenação virar "corrupção" e disparar stall/reconexão em WiFi).
      '-fflags', isLow ? 'nobuffer+igndts+discardcorrupt' : 'nobuffer+discardcorrupt',
      '-flags', 'low_delay',
      '-analyzeduration', isLow ? '1000000' : '5000000',
      '-probesize', isLow ? '500000' : '5000000',
      '-max_delay', isLow ? '1000000' : '5000000',
      '-reorder_queue_size', isLow ? '256' : '1000',
      '-i', url,
    ];

    const outputs: string[] = [
      // Saída 1: vídeo ao vivo (MPEG1) → pipe:1 → WebSocket (jsmpeg).
      '-map', '0:v:0',
      '-f', 'mpegts', '-codec:v', 'mpeg1video', '-vf', `scale=${scale}`,
      '-b:v', bitrate, '-r', '25', '-bf', '0', '-an', '-q', '1', 'pipe:1',
      // Saída 2: snapshot ao vivo (JPEG 1280) → arquivo, reaproveitado por snapshots/preset.
      '-map', '0:v:0', '-vf', 'fps=1,scale=1280:-1', '-q:v', '4', '-update', '1', '-y',
      liveFramePath(state.cameraId),
    ];
    if (state.record && state.recDir) {
      // Saída 3: gravação 24/7 (cópia, qualidade original) → segmentos MP4.
      outputs.push(
        '-map', '0:v:0', '-map', '0:a?', '-c:v', 'copy', '-c:a', 'aac',
        '-f', 'segment', '-segment_time', String(state.segmentSeconds ?? 600),
        '-segment_format', 'mp4', '-segment_format_options', 'movflags=+faststart',
        '-reset_timestamps', '1', '-strftime', '1',
        join(state.recDir, 'seg_%Y%m%d_%H%M%S.mp4'),
      );
    }
    const feedDetect = !!(state.detect && state.detectConfig?.aiEnabled && this.detectionAttach);
    if (feedDetect) {
      // Saída 4: quadros RGB para a inferência YOLO → pipe:3 (consumido localmente, no PC).
      outputs.push('-map', '0:v:0', '-an', '-vf', aiDetectVf(), '-f', 'rawvideo', 'pipe:3');
    }

    const args = [...inputArgs, ...outputs];
    const stdio: Array<'ignore' | 'pipe'> = feedDetect
      ? ['ignore', 'pipe', 'pipe', 'pipe']
      : ['ignore', 'pipe', 'pipe'];
    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio });
    state.ffmpeg = ffmpeg;

    // Entrega os quadros da MESMA puxada para a detecção IA (sem abrir outra sessão).
    if (feedDetect && state.camera && state.detectConfig) {
      const detStream = ffmpeg.stdio[3] as NodeJS.ReadableStream | undefined;
      if (detStream) this.detectionAttach?.(state.camera, state.detectConfig, detStream);
    }

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
        const backoff = Math.min(RECONNECT_DELAY_MS * Math.pow(2, state.reconnectCount), 30_000);
        state.reconnectCount++;
      state.reconnectTimer = setTimeout(() => {
          state.reconnectTimer = undefined;
          this.spawnCameraFfmpeg(state);
        }, backoff);
      }
    });
    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      state.lastDataAt = Date.now(); // alimenta o watchdog (chegou quadro novo)
      if (!state.gotData) {
        state.gotData = true;
        state.stallCount = 0; // reset stall count ao conectar com sucesso
        state.reconnectCount = 0; // reset reconexão ao conectar
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

      // Failover automático high → low. Normalmente só após N stalls consecutivos,
      // mas com `force` (quando o high NUNCA conectou) cai na hora — um main-stream
      // 8MP às vezes nem abre em WiFi, e ficar tentando só ele deixaria a tela preta.
      const attemptFailoverToLow = (force = false) => {
        if (!camera?.subStreamUrl) return false;
        if (state.quality === 'low') return false; // já está em low
        if (state.failoverActive) return false; // já tentou failover
        const stalls = state.stallCount || 0;
        if (!force && stalls < MAX_STALLS_BEFORE_FAILOVER) return false; // não atingiu threshold
        const nextQuality: 'low' = 'low';
        state.failoverActive = true;
        state.quality = nextQuality;
        state.lowSince = Date.now(); // marca quando entrou em low
        state.probeAttempt = 0; // reset tentativas de probe
        state.stallCount = 0; // reset ao trocar qualidade
        state.urlCandidates = this.buildUrlCandidates(camera, nextQuality);
        state.urlAttempt = 0;
        insertCameraLog(
          state.cameraId,
          name,
          'warn',
          `Failover automático: "${name}" caindo para qualidade baixa (sub-stream)`,
          `Câmera: ${name}\nIP: ${camera.ip}:${camera.port}\nQualidade preferida: ${state.preferredQuality}\nNova qualidade: ${nextQuality}\nStalls consecutivos: ${stalls}\nURL sub-stream: ${(camera.subStreamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\n${force ? 'O stream principal (alta qualidade) não pôde ser aberto — comum em câmera 8MP via WiFi.' : `O stream de alta qualidade travou ${stalls}x.`} Usando o sub-stream como fallback. O probe tentará restaurar a alta qualidade quando ela ficar estável.`,
          'streaming',
        );
        this.notifier?.({ cameraId: state.cameraId, status: 'error', error: 'Alta qualidade indisponível. Tentando baixa…' });
        this.spawnCameraFfmpeg(state);
        return true;
      };

      // Probe de estabilidade para voltar ao high: inicia FFmpeg "espião" no high,
      // só troca o stream principal se ficar estável por PROBE_STABLE_MS.
      const scheduleProbeToHigh = () => {
        if (state.preferredQuality !== 'high' || state.quality !== 'low' || state.probeTimer) return;
        const timeInLow = state.lowSince ? Date.now() - state.lowSince : 0;
        if (timeInLow < MIN_TIME_IN_LOW_MS) {
          // Ainda não passou tempo mínimo em low, agenda para depois
          const waitMs = MIN_TIME_IN_LOW_MS - timeInLow;
          state.probeTimer = setTimeout(() => {
            state.probeTimer = undefined;
            scheduleProbeToHigh();
          }, waitMs);
          return;
        }
        // Inicia probe
        startProbeToHigh(state);
      };

      const startProbeToHigh = (st: ActiveStream) => {
        const cam = st.camera;
        if (!cam || st.stopping || st.quality !== 'low') return;
        const probeUrl = this.buildUrlCandidates(cam, 'high')[0];
        if (!probeUrl || !isSafeStreamUrl(probeUrl)) {
          scheduleProbeRetry(st);
          return;
        }
        insertCameraLog(
          st.cameraId,
          name,
          'info',
          `Probe de estabilidade: testando alta qualidade para "${name}"`,
          `Câmera: ${name}\nIP: ${cam.ip}:${cam.port}\nTentativa probe: ${st.probeAttempt + 1}\nURL teste: ${probeUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nVerificando se stream principal está estável antes de trocar.`,
          'streaming',
        );

        const probeArgs = [
          ...hwaccelArgs(),
          '-rtsp_transport', 'tcp',
          '-timeout', '10000000',
          '-fflags', 'nobuffer',
          '-flags', 'low_delay',
          '-analyzeduration', '1000000',
          '-probesize', '500000',
          '-i', probeUrl,
          '-f', 'null',
          '-',
        ];
const probe = spawn(FFMPEG_PATH, probeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
        const probeStdout = probe.stdout as NodeJS.ReadableStream | null;
        let probeStableSince = 0;
        let probeFailed = false;

        const onProbeData = () => {
          if (probeStableSince === 0) probeStableSince = Date.now();
        };
        probeStdout?.on('data', onProbeData);

        const cleanupProbe = () => {
          probeStdout?.off('data', onProbeData);
          probe.removeAllListeners('close');
          probe.removeAllListeners('error');
          try { probe.kill('SIGKILL'); } catch {}
        };

        const checkProbeStable = () => {
          if (st.stopping || st.quality !== 'low') {
            cleanupProbe();
            return;
          }
          const now = Date.now();
          if (probeStableSince > 0 && now - probeStableSince >= PROBE_STABLE_MS) {
            // Probe estável por 10s — confirma troca para high
            cleanupProbe();
            insertCameraLog(
              st.cameraId,
              name,
              'info',
              `Probe estável: restaurando alta qualidade para "${name}"`,
              `Câmera: ${name}\nIP: ${cam.ip}:${cam.port}\nProbe ficou estável por ${PROBE_STABLE_MS / 1000}s. Trocando stream principal.`,
              'streaming',
            );
            st.quality = 'high';
            st.failoverActive = false;
            st.lowSince = undefined;
            st.probeAttempt = 0;
            st.stallCount = 0;
            st.urlCandidates = this.buildUrlCandidates(cam, 'high');
            st.urlAttempt = 0;
            this.spawnCameraFfmpeg(st);
            return;
          }
          if (!probeFailed) {
            st.probeTimer = setTimeout(checkProbeStable, 1000);
          }
        };
        checkProbeStable();

        probe.on('error', () => {
          if (!probeFailed) {
            probeFailed = true;
            cleanupProbe();
            scheduleProbeRetry(st);
          }
        });
        probe.on('close', () => {
          if (!probeFailed) {
            probeFailed = true;
            cleanupProbe();
            scheduleProbeRetry(st);
          }
        });
      };

      const scheduleProbeRetry = (st: ActiveStream) => {
        if (st.stopping || st.quality !== 'low') return;
        st.probeAttempt = (st.probeAttempt || 0) + 1;
        const backoff = PROBE_RETRY_BASE_MS * Math.min(2 ** (st.probeAttempt - 1), 8); // 30s, 60s, 120s... max 128x
        insertCameraLog(
          st.cameraId,
          name,
          'info',
          `Probe falhou, nova tentativa em ${Math.round(backoff / 1000)}s ("${name}")`,
          `Câmera: ${name}\nIP: ${st.camera?.ip || '—'}:${st.camera?.port || '—'}\nTentativa probe: ${st.probeAttempt}\nBackoff: ${Math.round(backoff / 1000)}s`,
          'streaming',
        );
        st.probeTimer = setTimeout(() => {
          st.probeTimer = undefined;
          startProbeToHigh(st);
        }, backoff);
      };

      if (neverConnected) {
        // Nunca conectou: tenta próxima URL na lista de fallbacks
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
        if (hasMoreUrls) {
          state.urlAttempt = nextAttempt;
          state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = undefined;
            this.spawnCameraFfmpeg(state);
          }, 500);
          return;
        }
        // Acabaram as URLs do high e NUNCA conectou: cai imediatamente para o sub-stream
        // (força, sem esperar acumular stalls — o main 8MP às vezes nem abre em WiFi).
        if (state.quality === 'high' && attemptFailoverToLow(true)) return;
      } else {
        // Estava conectado e caiu
        insertCameraLog(
          state.cameraId,
          name,
          'warn',
          `Conexão perdida com "${name}"`,
          `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\nUsuário: ${camera?.username || '—'}\nURL: ${(camera?.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nQualidade atual: ${state.quality}\n\nO stream estava rodando e caiu subitamente. Causas possíveis: queda de rede, câmera reiniciou, ou timeout.`,
          'streaming',
        );
        // Se estava em high e caiu, tenta failover para low
        if (state.quality === 'high' && attemptFailoverToLow()) return;
      }

      const msg = neverConnected
        ? 'Sem sinal — verifique a URL/credenciais. Tentando reconectar…'
        : 'Conexão perdida. Reconectando…';
      this.notifier?.({ cameraId: state.cameraId, status: 'error', error: msg });
      const backoff = Math.min(RECONNECT_DELAY_MS * Math.pow(2, state.reconnectCount), 30_000);
      state.reconnectCount++;
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = undefined;
        if (neverConnected) state.urlAttempt = 0; // reinicia tentativas do início
        this.spawnCameraFfmpeg(state);
        // Se está em failover (low), agenda probe para voltar ao high
        scheduleProbeToHigh();
      }, backoff);
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
      quality: 'high',
      preferredQuality: 'high',
      failoverActive: false,
      stallCount: 0,
      probeAttempt: 0,
      lastDataAt: Date.now(),
      urlCandidates: [],
      urlAttempt: 0,
      reconnectCount: 0,
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
    if (stream.failoverTimer) clearTimeout(stream.failoverTimer);
    if (stream.probeTimer) clearTimeout(stream.probeTimer);
    this.detectionDetach?.(cameraId); // encerra a detecção alimentada por esta puxada
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
