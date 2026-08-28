import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { FFMPEG_PATH } from './ffmpegPath';
import { hwaccelArgs } from './hwaccel';
import { isSafeStreamUrl } from './urlGuard';
import { injectCredentials } from './onvifInfo';
import { insertCameraLog } from './cameraLogger';
import { liveFramePath, freshLiveFrame } from './liveFrameCache';
import { aiDetectVf } from './ai/aiDetection';
import { motionVf } from './motionDetection';
import type { Camera, StreamInfo, DetectionConfig } from '../../src/shared/types';

// Callbacks para a detecção IA consumir os quadros da puxada única (injetados no main).
type DetectionAttach = (
  camera: Camera,
  config: DetectionConfig,
  stream: NodeJS.ReadableStream,
) => void;
type DetectionDetach = (cameraId: string) => void;
// Mesmo contrato para a detecção de MOVIMENTO, que também passou a consumir a puxada única.
type MotionAttach = DetectionAttach;
type MotionDetach = DetectionDetach;

const RECONNECT_DELAY_MS = 3000;
// Faixa de portas dos WebSockets de vídeo. Bind SOMENTE em loopback: o consumidor é o
// jsmpeg do próprio renderer (ws://localhost). Expor na LAN vazaria o vídeo sem token.
const WS_HOST = '127.0.0.1';
const WS_PORT_MIN = 9100;
const WS_PORT_MAX = 9400;
// Timeouts de stall (travamento) por qualidade. High mais tolerante p/ evitar failover prematuro.
const STALL_TIMEOUT_MS = { high: 30000, low: 45000 };
const WATCHDOG_INTERVAL_MS = 3000; // frequência de checagem do travamento
// Reciclagem da sessão RTSP por IDADE. O watchdog de stall acima só pega FFmpeg MUDO
// (lastDataAt só avança em stdout 'data'); câmera que degrada ainda enviando bytes passa
// batido. Contado por RELÓGIO DE PAREDE, não a partir do último spawn: os logs de produção
// mostram respawn a cada 10-40min, o que zeraria um contador ancorado no spawn para sempre.
// Mesmo princípio do RENDERER_RECYCLE_MS (main.ts).
const MAX_SESSION_MS = Number(process.env.SVL_STREAM_RECYCLE_MS) || 3 * 60 * 60 * 1000;
// Espalha os reloads: sem isto, N câmeras iniciadas juntas reciclam no mesmo segundo --
// rajada de RTSP simultânea contra o roteador e buraco de gravação global.
const RECYCLE_JITTER_MS = 10 * 60 * 1000;
const MAX_STALLS_BEFORE_FAILOVER = 3; // quantos stalls consecutivos em high antes de cair p/ low
// Restauração automática do HD (sub-stream → main-stream).
//
// ANTES isto era um "probe": um 2º FFmpeg espião abria uma sessão RTSP 8MP PARALELA na
// câmera só para testar se o HD estava estável. Em XM/8MP (que serve pouquíssimas sessões)
// essa 2ª sessão COMPETIA com o vídeo ao vivo e derrubava tudo. Pior: o probe era spawnado
// com stdout 'ignore' e saída "-f null -", então nunca produzia o sinal de estabilidade
// que ele mesmo esperava — ficava pendurado na câmera indefinidamente, sem ninguém para
// matá-lo (o processo não era guardado em lugar nenhum).
//
// AGORA a promoção acontece na PRÓPRIA puxada única: troca-se a qualidade e respawna-se o
// mesmo FFmpeg. Zero sessão extra. Se o HD não abrir ou travar, o failover que já existe
// devolve ao sub-stream e a próxima tentativa é agendada com backoff.
const MIN_TIME_IN_LOW_MS = 1_800_000; // 30min no sub antes de tentar o HD
const HIGH_RETRY_BASE_MS = 900_000; // backoff entre tentativas de HD (15min, 30min, 60min…)
const MAX_HIGH_ATTEMPTS = 6; // após isso, FICA no sub (o HD volta a ser tentado ao reabrir o stream)
// Limite de bytes enfileirados por cliente WebSocket antes de descartar quadro. Sem isto,
// um renderer lento faz o `ws` acumular vídeo na memória do processo principal sem teto.
const WS_MAX_BUFFERED_BYTES = 4_000_000;

function nextRecycleTime(): number {
  return Date.now() + MAX_SESSION_MS + Math.random() * RECYCLE_JITTER_MS;
}

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
  nextRecycleAt: number; // quando reciclar a sessão (ver MAX_SESSION_MS)
  watchdog?: ReturnType<typeof setInterval>;
  urlCandidates: string[]; // URLs a tentar (fallback paths)
  urlAttempt: number; // índice atual em urlCandidates
  // URL que JÁ entregou quadro nesta qualidade. Enquanto existir, a reconexão usa só ela
  // em vez de varrer os ~59 fallbacks — essa varredura dispara dezenas de conexões RTSP
  // em rajada contra a câmera e é ela mesma uma causa de travamento em câmeras XM.
  workingUrl?: string;
  stallCount: number; // stalls consecutivos na qualidade atual (reset ao trocar qualidade)
  reconnectCount: number; // tentativas de reconexão consecutivas (para backoff)
  hwFailed?: boolean; // aceleração de HW abriu o RTSP mas não produziu quadro → usar software (comum em HEVC/dxva2)
  // Restauração automática do HD (na própria puxada, sem 2ª sessão)
  highTimer?: ReturnType<typeof setTimeout>;
  highAttempt: number; // tentativas de promoção ao HD (para backoff exponencial)
  lowSince?: number; // timestamp quando entrou em low
  // Fonte única: a MESMA puxada alimenta vários usos, decodificando uma vez só.
  viewerActive?: boolean; // há visualização ao vivo ativa
  record?: boolean; // gravar segmentos MP4 desta puxada
  detect?: boolean; // alimentar a detecção IA com os quadros desta puxada
  motion?: boolean; // alimentar a detecção de MOVIMENTO com os quadros desta puxada
  verify?: boolean; // verificação/autoajuste de posição consumindo o liveFrame desta puxada
  detectConfig?: DetectionConfig;
  motionConfig?: DetectionConfig;
  recDir?: string; // diretório dos segmentos de gravação
  segmentSeconds?: number;
  eventClip?: WriteStream; // clipe de evento derivado desta puxada (MPEG-TS), se houver
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
  private motionAttach?: MotionAttach;
  private motionDetach?: MotionDetach;

  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  // Gancho para pedir ao monitor de conexão que reencontre a câmera pelo MAC AGORA
  // (quando o stream não conecta e pode ser troca de IP por DHCP, mesmo com o IP antigo
  // ainda respondendo TCP). Injetado no main para não acoplar os módulos.
  private healRequester?: (cameraId: string) => void;
  setHealRequester(fn: (cameraId: string) => void): void {
    this.healRequester = fn;
  }

  // Injeta como a detecção IA recebe os quadros da puxada única (evita acoplar módulos).
  setDetectionSink(attach: DetectionAttach, detach: DetectionDetach): void {
    this.detectionAttach = attach;
    this.detectionDetach = detach;
  }

  // Idem para a detecção de MOVIMENTO (antes ela abria a própria sessão RTSP).
  setMotionSink(attach: MotionAttach, detach: MotionDetach): void {
    this.motionAttach = attach;
    this.motionDetach = detach;
  }

  // Verdadeiro se algo ainda precisa da puxada (visualização, gravação ou detecção).
  private stillNeeded(state: ActiveStream): boolean {
    return !!(state.viewerActive || state.record || state.detect || state.motion || state.verify);
  }

  // Mantém a puxada única viva durante a verificação/autoajuste de posição, para que ela
  // CONSUMA o liveFrame compartilhado em vez de abrir sessões RTSP próprias (que saturam
  // câmeras com poucas sessões, ex.: Xiongmai). Liga a puxada se preciso e aguarda um
  // primeiro quadro fresco (até ~6s). Idempotente por câmera.
  async retainForCapture(camera: Camera): Promise<void> {
    const st = await this.ensureState(
      camera,
      this.streams.get(camera.id)?.preferredQuality ?? 'high',
    );
    st.verify = true;
    if (!st.ffmpeg) this.spawnCameraFfmpeg(st);
    for (let i = 0; i < 20; i++) {
      if (freshLiveFrame(camera.id)) return;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Libera a retenção da verificação; desliga a puxada só se nada mais precisar dela.
  releaseForCapture(cameraId: string): void {
    const st = this.streams.get(cameraId);
    if (!st) return;
    st.verify = false;
    if (!this.stillNeeded(st)) this.stop(cameraId);
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
      highAttempt: 0,
      lastDataAt: Date.now(),
      nextRecycleAt: nextRecycleTime(),
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

  // Liga/desliga a alimentação da DETECÇÃO DE MOVIMENTO a partir desta puxada única.
  async setMotion(camera: Camera, config: DetectionConfig, on: boolean): Promise<void> {
    if (!on) {
      const st = this.streams.get(camera.id);
      if (!st || !st.motion) return;
      st.motion = false;
      st.motionConfig = undefined;
      this.motionDetach?.(camera.id);
      if (!this.stillNeeded(st)) this.stop(camera.id);
      else this.reconfigure(st);
      return;
    }
    const st = await this.ensureState(
      camera,
      this.streams.get(camera.id)?.preferredQuality ?? 'high',
    );
    const sameConfig = st.motion && JSON.stringify(st.motionConfig) === JSON.stringify(config);
    if (sameConfig) {
      if (!st.ffmpeg) this.spawnCameraFfmpeg(st);
      return;
    }
    st.motion = true;
    st.motionConfig = config;
    this.reconfigure(st);
  }

  // Reinicia o FFmpeg da puxada única para aplicar mudança de saídas (gravação/detecção).
  private reconfigure(state: ActiveStream): void {
    if (state.stopping) return;
    // O renderer PRECISA ser avisado. O jsmpeg não sobrevive a um stream MPEG-TS novo no
    // meio do fluxo, e aqui o 'close' do FFmpeg é suprimido (removeAllListeners abaixo),
    // então o aviso de queda nunca sairia e a imagem ficaria congelada até trocar de tela.
    // O Player recria o decoder ao ver error -> running. Ver Player.tsx (mountJsmpeg).
    if (!state.isFile) {
      this.notifier?.({
        cameraId: state.cameraId,
        status: 'error',
        error: 'Reiniciando vídeo…',
      });
    }
    this.detectionDetach?.(state.cameraId); // será reanexada no novo spawn, se ainda ligada
    this.motionDetach?.(state.cameraId);
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
    // Delega o kill/respawn: era código idêntico duplicado, e por reconfigure o renderer
    // ainda recebe o aviso para recriar o decoder.
    this.reconfigure(state);
  }

  private startWatchdog(state: ActiveStream): void {
    if (state.watchdog) return;
    state.watchdog = setInterval(() => {
      if (state.stopping || !state.ffmpeg || state.reconnectTimer) return;
      // Lido a cada tique (e não capturado na criação): depois de um failover high→low
      // o watchdog precisa passar a usar o timeout mais tolerante do sub-stream, senão
      // continua cobrando 30s de um stream que tem direito a 45s e reinicia à toa.
      const timeout = STALL_TIMEOUT_MS[state.quality];
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
        return; // acabou de respawnar: não recicla no mesmo tique
      }
      // Reciclagem por idade -- ver MAX_SESSION_MS. Adiada enquanto um clipe de evento
      // está sendo escrito: o restart cortaria o MPEG-TS no meio (tenta de novo em 3s).
      if (!state.isFile && !state.eventClip && Date.now() >= state.nextRecycleAt) {
        state.nextRecycleAt = nextRecycleTime();
        console.log(
          `[streaming] reload programado de "${state.camera?.name || state.cameraId}" ` +
            `(sessão com mais de ${Math.round(MAX_SESSION_MS / 60000)}min)`,
        );
        this.reconfigure(state); // avisa o renderer e respawna o FFmpeg
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  // Agenda a próxima tentativa de voltar ao main-stream (HD) enquanto a puxada está no
  // sub-stream. A tentativa acontece NA PRÓPRIA puxada (ver `promoteToHigh`), então nunca
  // abre uma 2ª sessão RTSP na câmera — foi exatamente isso que o antigo "probe" fazia.
  private scheduleHighRetry(state: ActiveStream): void {
    if (state.stopping) return;
    if (state.preferredQuality !== 'high' || state.quality !== 'low') return;
    if (state.highTimer) return; // já agendado
    // Esgotou as tentativas: fica no sub-stream (estável) e para de insistir no HD. O
    // contador passa de MAX para que este aviso saia UMA vez, e não a cada reconexão.
    if (state.highAttempt >= MAX_HIGH_ATTEMPTS) {
      if (state.highAttempt === MAX_HIGH_ATTEMPTS) {
        state.highAttempt += 1;
        const name = state.camera?.name || state.cameraId;
        insertCameraLog(
          state.cameraId,
          name,
          'info',
          `Mantendo sub-stream de "${name}" — auto-restauração do HD pausada`,
          `Câmera: ${name}\nApós ${MAX_HIGH_ATTEMPTS} tentativas o stream principal não estabilizou. O app fica no sub-stream (conexão estável) e PARA de tentar reabrir o HD automaticamente. O HD volta a ser tentado ao reabrir a câmera/stream.`,
          'streaming',
        );
      }
      return;
    }

    // Na 1ª tentativa espera o tempo mínimo em low; nas seguintes, backoff exponencial.
    const timeInLow = state.lowSince ? Date.now() - state.lowSince : 0;
    const delay =
      state.highAttempt === 0
        ? Math.max(0, MIN_TIME_IN_LOW_MS - timeInLow)
        : HIGH_RETRY_BASE_MS * Math.min(2 ** (state.highAttempt - 1), 8);

    state.highTimer = setTimeout(() => {
      state.highTimer = undefined;
      this.promoteToHigh(state);
    }, delay);
  }

  // Tenta voltar ao HD trocando a qualidade da puxada única e respawnando o MESMO FFmpeg.
  // Se o HD não abrir (ou travar depois), o failover que já existe devolve ao sub-stream e
  // agenda a próxima tentativa. Em nenhum momento há duas sessões RTSP na câmera.
  private promoteToHigh(state: ActiveStream): void {
    const camera = state.camera;
    if (!camera || state.stopping || state.quality !== 'low') return;
    if (state.preferredQuality !== 'high') return;

    state.highAttempt += 1;
    const name = camera.name || state.cameraId;

    insertCameraLog(
      state.cameraId,
      name,
      'info',
      `Tentando restaurar a alta qualidade de "${name}" (tentativa ${state.highAttempt}/${MAX_HIGH_ATTEMPTS})`,
      `Câmera: ${name}\nIP: ${camera.ip}:${camera.port}\n\nA puxada única será reaberta no stream principal. Se ele não abrir ou travar, o app volta sozinho ao sub-stream e tenta de novo mais tarde. Nenhuma sessão RTSP paralela é aberta na câmera.`,
      'streaming',
    );

    // `failoverActive` volta a false para que o failover possa atuar de novo se o HD falhar.
    state.quality = 'high';
    state.failoverActive = false;
    state.stallCount = 0;
    state.reconnectCount = 0;
    state.urlCandidates = this.buildUrlCandidates(camera, 'high');
    state.urlAttempt = 0;
    state.workingUrl = undefined; // outra qualidade, outra URL boa
    this.reconfigure(state);
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
    // URL já comprovada tem prioridade absoluta: evita revarrer a lista de fallbacks
    // (e disparar dezenas de conexões RTSP) toda vez que a câmera pisca.
    const url = state.workingUrl ?? state.urlCandidates[state.urlAttempt];
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
      // Se a aceleração de HW já falhou nesta puxada (abriu mas não deu quadro — típico
      // de HEVC via dxva2), decodifica por software.
      ...(state.hwFailed ? [] : hwaccelArgs()),
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
    const feedMotion = !!(state.motion && state.motionConfig?.motionEnabled && this.motionAttach);
    if (feedMotion) {
      // Saída 5: quadros cinza 320x180 para a análise de MOVIMENTO → pipe:4.
      outputs.push('-map', '0:v:0', '-an', '-vf', motionVf(), '-f', 'rawvideo', 'pipe:4');
    }

    const args = [...inputArgs, ...outputs];
    // stdio: 0=stdin, 1=vídeo ao vivo, 2=stderr, 3=IA, 4=movimento. Os descritores extras
    // só viram 'pipe' quando a saída correspondente existe — as posições são FIXAS para
    // que "pipe:3"/"pipe:4" nos argumentos sempre correspondam ao mesmo consumidor.
    const stdio: Array<'ignore' | 'pipe'> = ['ignore', 'pipe', 'pipe'];
    if (feedDetect || feedMotion) stdio.push(feedDetect ? 'pipe' : 'ignore');
    if (feedMotion) stdio.push('pipe');
    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio });
    state.ffmpeg = ffmpeg;

    // Entrega os quadros da MESMA puxada para a detecção IA (sem abrir outra sessão).
    if (feedDetect && state.camera && state.detectConfig) {
      const detStream = ffmpeg.stdio[3] as NodeJS.ReadableStream | undefined;
      if (detStream) this.detectionAttach?.(state.camera, state.detectConfig, detStream);
    }
    // Idem para a detecção de movimento.
    if (feedMotion && state.camera && state.motionConfig) {
      const motStream = ffmpeg.stdio[4] as NodeJS.ReadableStream | undefined;
      if (motStream) this.motionAttach?.(state.camera, state.motionConfig, motStream);
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
        // Esta URL entregou quadro: fixa como a boa. As reconexões seguintes usam só ela,
        // em vez de varrer os ~59 fallbacks disparando conexões RTSP em rajada na câmera.
        state.workingUrl = state.urlCandidates[state.urlAttempt];
        if (state.quality === 'high') {
          // O HD voltou de fato: zera o contador de tentativas de promoção.
          state.highAttempt = 0;
          state.lowSince = undefined;
        }
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
      // Clipe de evento: escreve o MESMO MPEG-TS que vai para a tela. Não custa nada à
      // câmera — os bytes já existem.
      state.eventClip?.write(chunk);
      for (const client of state.wss.clients) {
        // Sem este teto, um renderer lento faz o `ws` acumular vídeo na heap do processo
        // principal indefinidamente. Vídeo ao vivo é descartável: perder quadro é melhor
        // que estourar memória e travar o main (que também é quem drena o FFmpeg).
        if (client.readyState === client.OPEN && client.bufferedAmount < WS_MAX_BUFFERED_BYTES) {
          client.send(chunk);
        }
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
        state.stallCount = 0; // reset ao trocar qualidade
        state.urlCandidates = this.buildUrlCandidates(camera, nextQuality);
        state.urlAttempt = 0;
        state.workingUrl = undefined; // outra qualidade, outra URL boa
        insertCameraLog(
          state.cameraId,
          name,
          'warn',
          `Failover automático: "${name}" caindo para qualidade baixa (sub-stream)`,
          `Câmera: ${name}\nIP: ${camera.ip}:${camera.port}\nQualidade preferida: ${state.preferredQuality}\nNova qualidade: ${nextQuality}\nStalls consecutivos: ${stalls}\nURL sub-stream: ${(camera.subStreamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\n${force ? 'O stream principal (alta qualidade) não pôde ser aberto — comum em câmera 8MP via WiFi.' : `O stream de alta qualidade travou ${stalls}x.`} Usando o sub-stream como fallback. A alta qualidade será tentada de novo mais tarde, NA MESMA puxada (sem abrir uma 2ª sessão RTSP na câmera).`,
          'streaming',
        );
        this.notifier?.({ cameraId: state.cameraId, status: 'error', error: 'Alta qualidade indisponível. Tentando baixa…' });
        this.spawnCameraFfmpeg(state);
        this.scheduleHighRetry(state); // volta a tentar o HD depois, sem sessão paralela
        return true;
      };

      if (neverConnected) {
        // Abriu o RTSP mas NÃO saiu quadro? Em H.265/HEVC a aceleração de hardware
        // (dxva2/auto) às vezes "decodifica no vazio" e o FFmpeg não emite nada. Antes de
        // trocar de URL / fazer failover, tenta UMA vez com decodificação por SOFTWARE na
        // mesma URL — costuma resolver de imediato. Fica sticky nesta puxada (até reiniciar).
        if (!state.hwFailed && hwaccelArgs().length > 0) {
          state.hwFailed = true;
          insertCameraLog(
            state.cameraId,
            name,
            'warn',
            `Sem quadros com aceleração de hardware em "${name}" — tentando por software (H.265/HEVC)`,
            `Câmera: ${name}\nIP: ${camera?.ip || '—'}:${camera?.port || '—'}\n\nO FFmpeg abriu o RTSP mas não produziu quadro usando a aceleração de hardware (comum em streams H.265/HEVC via dxva2, que não cai para software sozinho). Recriando o pipeline com decodificação por SOFTWARE. Se for isso, o vídeo volta em seguida.`,
            'streaming',
          );
          state.urlAttempt = 0;
          if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
          state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = undefined;
            this.spawnCameraFfmpeg(state);
          }, 300);
          return;
        }
        // URL já comprovada falhando: quase sempre é a câmera fora do ar ou troca de IP,
        // não caminho errado. Reconecta com backoff na MESMA URL em vez de bombardear a
        // câmera com a lista inteira. Só após várias falhas seguidas volta a varrer.
        if (state.workingUrl) {
          const RESCAN_AFTER_FAILURES = 5;
          if (state.reconnectCount >= RESCAN_AFTER_FAILURES) {
            insertCameraLog(
              state.cameraId,
              name,
              'warn',
              `URL conhecida de "${name}" falhou ${state.reconnectCount}x — voltando a testar caminhos alternativos`,
              `Câmera: ${name}\nURL que funcionava: ${state.workingUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n\nA URL que vinha funcionando parou de responder repetidas vezes. O app volta a testar a lista de caminhos RTSP alternativos (pode ter havido atualização de firmware na câmera).`,
              'streaming',
            );
            state.workingUrl = undefined;
            state.urlAttempt = 0;
          } else {
            this.healRequester?.(state.cameraId); // pode ser troca de IP por DHCP
          }
        }

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
        if (hasMoreUrls && !state.workingUrl) {
          state.urlAttempt = nextAttempt;
          state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = undefined;
            this.spawnCameraFfmpeg(state);
          }, 500);
          return;
        }
        // Esgotou as URLs e nunca conectou. Pode ser troca de IP (DHCP) — mesmo que o IP
        // antigo ainda responda TCP (fantasma), o stream não vem. Pede ao monitor para
        // reencontrar a câmera pelo MAC AGORA (não espera o ciclo). Se o IP mudou, o
        // refreshCamera religa no IP novo; se não, segue a reconexão normal abaixo.
        this.healRequester?.(state.cameraId);
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
        // Se está em failover (low), mantém agendada a retentativa do HD.
        this.scheduleHighRetry(state);
      }, backoff);
    });
  }

  // Inicia um clipe de evento a partir da puxada única, gravando o MPEG-TS que já é
  // produzido para o vídeo ao vivo. Antes, cada evento spawnava um FFmpeg novo apontando
  // para o main-stream da câmera — uma 2ª sessão RTSP a cada pessoa/veículo detectado, que
  // em câmeras XM é justamente o que derruba o vídeo. Retorna false se não há puxada ativa
  // (aí o chamador cai para o caminho RTSP tradicional).
  startEventClip(cameraId: string, tsPath: string): boolean {
    const st = this.streams.get(cameraId);
    if (!st || st.isFile || st.eventClip) return false;
    try {
      st.eventClip = createWriteStream(tsPath);
      return true;
    } catch {
      return false;
    }
  }

  // Encerra o clipe e avisa quando o arquivo estiver fechado (pronto para remux).
  stopEventClip(cameraId: string, onClosed?: () => void): void {
    const st = this.streams.get(cameraId);
    const ws = st?.eventClip;
    if (!ws || !st) {
      onClosed?.();
      return;
    }
    st.eventClip = undefined;
    ws.end(() => onClosed?.());
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
      highAttempt: 0,
      lastDataAt: Date.now(),
      nextRecycleAt: Infinity, // reprodução de arquivo nunca recicla (isFile)
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
    if (stream.highTimer) clearTimeout(stream.highTimer);
    this.detectionDetach?.(cameraId); // encerra a detecção alimentada por esta puxada
    this.motionDetach?.(cameraId);
    if (stream.eventClip) {
      stream.eventClip.end();
      stream.eventClip = undefined;
    }
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
