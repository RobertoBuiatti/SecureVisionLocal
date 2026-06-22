import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { FFMPEG_PATH } from './ffmpegPath';
import type { Camera, DetectionConfig, DetectionEvent } from '../../src/shared/types';
import { insertDetectionEvent, newEventId } from './detectionRepository';
import { recordingService } from './recording';

const W = 320;
const H = 180;
const FRAME_SIZE = W * H; // 1 byte por pixel (gray)
const EVENT_DEBOUNCE_MS = 4000; // no máx. 1 evento a cada 4s por câmera
const RECORD_STOP_DELAY_MS = 12000; // para a gravação 12s após o fim do movimento

interface MotionState {
  camera: Camera;
  config: DetectionConfig;
  ffmpeg: ChildProcessWithoutNullStreams;
  prev: Buffer | null;
  buffer: Buffer;
  lastEventAt: number;
  recordStopTimer: ReturnType<typeof setTimeout> | null;
  recording: boolean;
}

type Notifier = (ev: DetectionEvent) => void;

// Converte a sensibilidade (1-100) num limiar de diferença média de pixels.
function sensitivityToThreshold(sensitivity: number): number {
  const s = Math.max(1, Math.min(100, sensitivity));
  return 3 + ((100 - s) / 100) * 15; // ~3 (sensível) a ~18 (pouco sensível)
}

export class MotionDetectionService {
  private active = new Map<string, MotionState>();
  private notifier?: Notifier;

  setNotifier(n: Notifier): void {
    this.notifier = n;
  }

  isActive(cameraId: string): boolean {
    return this.active.has(cameraId);
  }

  start(camera: Camera, config: DetectionConfig): void {
    if (this.active.has(camera.id)) return;
    const url = camera.subStreamUrl || camera.streamUrl;
    const args = [
      '-rtsp_transport', 'tcp',
      '-i', url,
      '-an',
      '-vf', `fps=3,scale=${W}:${H},format=gray`,
      '-f', 'rawvideo',
      'pipe:1',
    ];
    const ffmpeg = spawn(FFMPEG_PATH, args);
    const state: MotionState = {
      camera,
      config,
      ffmpeg,
      prev: null,
      buffer: Buffer.alloc(0),
      lastEventAt: 0,
      recordStopTimer: null,
      recording: false,
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
    try {
      state.ffmpeg.kill('SIGKILL');
    } catch {
      /* noop */
    }
  }

  stopAll(): void {
    for (const id of Array.from(this.active.keys())) this.stop(id);
  }

  // Acumula bytes até formar um frame completo e então o analisa.
  private onData(cameraId: string, chunk: Buffer): void {
    const state = this.active.get(cameraId);
    if (!state) return;
    state.buffer = Buffer.concat([state.buffer, chunk]);
    while (state.buffer.length >= FRAME_SIZE) {
      const frame = state.buffer.subarray(0, FRAME_SIZE);
      state.buffer = state.buffer.subarray(FRAME_SIZE);
      this.analyzeFrame(state, Buffer.from(frame));
    }
  }

  private analyzeFrame(state: MotionState, frame: Buffer): void {
    if (state.prev) {
      let sum = 0;
      // amostragem (passo 4) para reduzir custo
      for (let i = 0; i < FRAME_SIZE; i += 4) {
        sum += Math.abs(frame[i] - state.prev[i]);
      }
      const score = sum / (FRAME_SIZE / 4);
      const threshold = sensitivityToThreshold(state.config.sensitivity);
      if (score > threshold) this.onMotion(state, score);
    }
    state.prev = frame;
  }

  private onMotion(state: MotionState, score: number): void {
    const now = Date.now();

    // Evento (com debounce) para o log da UI + banco.
    if (now - state.lastEventAt > EVENT_DEBOUNCE_MS) {
      state.lastEventAt = now;
      const ev: DetectionEvent = {
        id: newEventId(),
        cameraId: state.camera.id,
        cameraName: state.camera.name,
        type: 'motion',
        timestamp: now,
        score: Math.round(score),
      };
      insertDetectionEvent(ev);
      this.notifier?.(ev);
    }

    // Gravação por movimento (se habilitada): inicia e renova o timer de parada.
    if (state.config.recordMotion) {
      if (!state.recording && !recordingService.isRecording(state.camera.id)) {
        recordingService.start(state.camera, 'motion');
        state.recording = true;
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
}

export const motionDetectionService = new MotionDetectionService();
