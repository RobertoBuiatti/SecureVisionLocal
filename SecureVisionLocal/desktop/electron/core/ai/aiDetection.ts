import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { FFMPEG_PATH } from '../ffmpegPath';
import type { Camera, DetectionConfig, DetectionEvent, DetectionType } from '../../../src/shared/types';

// Carrega o onnxruntime de forma preguiçosa e tolerante a falhas: se o runtime
// nativo não estiver disponível, a IA fica desativada sem derrubar o aplicativo.
const nodeRequire = createRequire(__filename);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortLib: any = null;
let ortTried = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ort(): any {
  if (!ortTried) {
    ortTried = true;
    try {
      ortLib = nodeRequire('onnxruntime-node');
    } catch {
      ortLib = null;
    }
  }
  return ortLib;
}

export function isAiRuntimeAvailable(): boolean {
  return !!ort();
}
import { insertDetectionEvent, newEventId } from '../detectionRepository';
import { recordingService } from '../recording';
import { continuousMoveVector, controlPtz } from '../ptz';
import { tourRunner } from '../tourRunner';
import { getTour } from '../ptzRepository';
import { ensureModel, isModelReady, resolveModelPath, type ModelKey } from './modelManager';
import { preprocess, decode, nms, cocoToCategory, YOLO_INPUT, type Detection } from './yolo';

const TRACK_DEADZONE = 0.12; // tolerância antes de mover (objeto considerado centralizado)
const TRACK_GAIN = 0.6; // suavidade do movimento de rastreio
const TRACK_MAX_SPEED = 0.7;

const FRAME_BYTES = YOLO_INPUT * YOLO_INPUT * 3;
const OBJ_CONF = 0.4;
const EVENT_DEBOUNCE_MS = 4000;
const RECORD_STOP_DELAY_MS = 12000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = any;

interface CamState {
  camera: Camera;
  config: DetectionConfig;
  ffmpeg: ChildProcessWithoutNullStreams;
  buffer: Buffer;
  busy: boolean;
  lastEventAt: Record<string, number>;
  recordStopTimer: ReturnType<typeof setTimeout> | null;
  recording: boolean;
  // Rastreio (acompanhar objeto com PTZ)
  tracking: boolean;
  trackUntil: number;
  trackMonitor: ReturnType<typeof setInterval> | null;
  resumeTourId: string | null;
}

type Notifier = (ev: DetectionEvent) => void;

export class AiDetectionService {
  private active = new Map<string, CamState>();
  private sessions = new Map<ModelKey, Session>();
  private notifier?: Notifier;

  setNotifier(n: Notifier): void {
    this.notifier = n;
  }

  isActive(cameraId: string): boolean {
    return this.active.has(cameraId);
  }

  hasModels(): boolean {
    return isModelReady('object');
  }

  // Carrega (e baixa se necessário) a sessão de um modelo. Retorna null se indisponível.
  private async getSession(key: ModelKey): Promise<Session | null> {
    const cached = this.sessions.get(key);
    if (cached) return cached;
    const runtime = ort();
    if (!runtime) return null;
    const ok = await ensureModel(key);
    if (!ok) return null;
    const path = resolveModelPath(key);
    if (!path) return null;
    try {
      const session = await runtime.InferenceSession.create(path);
      this.sessions.set(key, session);
      return session;
    } catch {
      return null;
    }
  }

  start(camera: Camera, config: DetectionConfig): void {
    if (this.active.has(camera.id)) return;
    const url = camera.subStreamUrl || camera.streamUrl;
    const args = [
      '-rtsp_transport', 'tcp',
      '-i', url,
      '-an',
      '-vf', `fps=1.5,scale=${YOLO_INPUT}:${YOLO_INPUT},format=rgb24`,
      '-f', 'rawvideo',
      'pipe:1',
    ];
    const ffmpeg = spawn(FFMPEG_PATH, args);
    const state: CamState = {
      camera,
      config,
      ffmpeg,
      buffer: Buffer.alloc(0),
      busy: false,
      lastEventAt: {},
      recordStopTimer: null,
      recording: false,
      tracking: false,
      trackUntil: 0,
      trackMonitor: null,
      resumeTourId: null,
    };
    ffmpeg.on('error', () => this.stop(camera.id));
    ffmpeg.on('close', () => {
      if (this.active.get(camera.id)?.ffmpeg === ffmpeg) this.active.delete(camera.id);
    });
    ffmpeg.stdout.on('data', (chunk: Buffer) => this.onData(camera.id, chunk));
    this.active.set(camera.id, state);
  }

  stop(cameraId: string): void {
    const state = this.active.get(cameraId);
    if (!state) return;
    this.active.delete(cameraId);
    if (state.recordStopTimer) clearTimeout(state.recordStopTimer);
    if (state.tracking) this.stopTracking(state);
    try {
      state.ffmpeg.kill('SIGKILL');
    } catch {
      /* noop */
    }
  }

  stopAll(): void {
    for (const id of Array.from(this.active.keys())) this.stop(id);
  }

  private onData(cameraId: string, chunk: Buffer): void {
    const state = this.active.get(cameraId);
    if (!state) return;
    state.buffer = Buffer.concat([state.buffer, chunk]);
    // processa apenas o quadro mais recente; descarta acumulados se estiver ocupado
    while (state.buffer.length >= FRAME_BYTES) {
      const frame = Buffer.from(state.buffer.subarray(0, FRAME_BYTES));
      state.buffer = state.buffer.subarray(FRAME_BYTES);
      if (!state.busy) {
        state.busy = true;
        void this.process(cameraId, frame).finally(() => {
          const s = this.active.get(cameraId);
          if (s) s.busy = false;
        });
      }
    }
  }

  private async process(cameraId: string, frame: Buffer): Promise<void> {
    const state = this.active.get(cameraId);
    if (!state) return;
    const runtime = ort();
    if (!runtime) return;
    const input = preprocess(frame);
    const tensor = new runtime.Tensor('float32', input, [1, 3, YOLO_INPUT, YOLO_INPUT]);

    // Objetos (pessoa / animal / veículo)
    const objSession = await this.getSession('object');
    if (!objSession) return;
    const out = await this.run(objSession, tensor);
    if (!out) return;

    const dets = nms(decode(out.data, out.dims, OBJ_CONF))
      .map((d) => ({ d, cat: cocoToCategory(d.classId) }))
      .filter((x): x is { d: Detection; cat: 'person' | 'vehicle' | 'animal' } => x.cat !== null);

    for (const { d, cat } of dets) this.onDetection(state, cat, d.score);

    // Acompanhar (PTZ) o objeto mais próximo (maior área), se habilitado.
    // Se a câmera já possui rastreamento próprio (firmware), NÃO enviamos comandos
    // PTZ — senão o software e a câmera brigam pelo controle (tremedeira/oscilação).
    if (
      state.config.trackEnabled &&
      state.camera.hasPTZ &&
      !state.camera.hasOnboardTracking &&
      dets.length > 0
    ) {
      const best = dets.reduce((a, b) => (a.d.w * a.d.h >= b.d.w * b.d.h ? a : b));
      this.track(state, best.d);
    }
  }

  // Centraliza o objeto detectado movendo o PTZ proporcionalmente ao deslocamento.
  private track(state: CamState, box: Detection): void {
    state.trackUntil = Date.now() + Math.max(3, state.config.trackSeconds) * 1000;
    if (!state.tracking) this.startTracking(state);

    const center = YOLO_INPUT / 2;
    const errX = (box.x + box.w / 2 - center) / center;
    const errY = (box.y + box.h / 2 - center) / center;

    if (Math.abs(errX) < TRACK_DEADZONE && Math.abs(errY) < TRACK_DEADZONE) {
      void controlPtz(state.camera, { action: 'stop' }); // já centralizado
      return;
    }
    const clamp = (v: number) => Math.max(-TRACK_MAX_SPEED, Math.min(TRACK_MAX_SPEED, v));
    const x = clamp(errX * TRACK_GAIN);
    const y = clamp(-errY * TRACK_GAIN); // tela: y para baixo = tilt negativo
    void continuousMoveVector(state.camera, x, y);
  }

  private startTracking(state: CamState): void {
    state.tracking = true;
    // pausa a rota durante o acompanhamento
    const status = tourRunner.status(state.camera.id);
    state.resumeTourId = status.running ? status.tourId : null;
    if (state.resumeTourId) tourRunner.stop(state.camera.id);
    // monitora o término do acompanhamento
    state.trackMonitor = setInterval(() => {
      if (Date.now() >= state.trackUntil) this.stopTracking(state);
    }, 700);
  }

  private stopTracking(state: CamState): void {
    state.tracking = false;
    if (state.trackMonitor) clearInterval(state.trackMonitor);
    state.trackMonitor = null;
    void controlPtz(state.camera, { action: 'stop' });
    // retoma a rota que estava rodando antes do acompanhamento
    if (state.resumeTourId) {
      const tour = getTour(state.resumeTourId);
      if (tour) tourRunner.start(state.camera, tour);
      state.resumeTourId = null;
    }
  }

  private async run(
    session: Session,
    tensor: unknown,
  ): Promise<{ data: Float32Array; dims: readonly number[] } | null> {
    try {
      const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
      const result = await session.run(feeds);
      const out = result[session.outputNames[0]];
      return { data: out.data as Float32Array, dims: out.dims as number[] };
    } catch {
      return null;
    }
  }

  private onDetection(state: CamState, type: DetectionType, score: number): void {
    const now = Date.now();
    if (now - (state.lastEventAt[type] ?? 0) > EVENT_DEBOUNCE_MS) {
      state.lastEventAt[type] = now;
      const ev: DetectionEvent = {
        id: newEventId(),
        cameraId: state.camera.id,
        cameraName: state.camera.name,
        type,
        timestamp: now,
        score: Math.round(score * 100),
      };
      insertDetectionEvent(ev);
      this.notifier?.(ev);
    }

    if (this.shouldRecord(state.config, type)) {
      if (!state.recording && !recordingService.isRecording(state.camera.id)) {
        try {
          // Marca a gravação com o QUE disparou (pessoa/veículo/animal).
          recordingService.start(state.camera, 'event', type);
          state.recording = true;
        } catch {
          /* URL inválida — evento segue registrado, sem gravação */
        }
      }
      if (state.recordStopTimer) clearTimeout(state.recordStopTimer);
      state.recordStopTimer = setTimeout(() => {
        if (state.recording) {
          recordingService.stop(state.camera.id);
          state.recording = false;
        }
      }, RECORD_STOP_DELAY_MS);
    }
  }

  private shouldRecord(c: DetectionConfig, type: DetectionType): boolean {
    switch (type) {
      case 'person':
        return c.recordPerson;
      case 'vehicle':
        return c.recordVehicle;
      case 'animal':
        return c.recordAnimal;
      default:
        return false;
    }
  }
}

export const aiDetectionService = new AiDetectionService();
