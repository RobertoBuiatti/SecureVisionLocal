import { insertCameraLog } from './cameraLogger';
import type { Camera, DetectionConfig, DetectionEvent } from '../../src/shared/types';
import { insertDetectionEvent, newEventId } from './detectionRepository';
import { recordingService } from './recording';
import { captureDetectionSnapshot } from './ai/detectionSnapshotCapture';
import { getSettings } from './settings';

const W = 320;
const H = 180;
const FRAME_SIZE = W * H; // 1 byte por pixel (gray)
const EVENT_DEBOUNCE_MS = 4000; // no máx. 1 evento a cada 4s por câmera
const RECORD_STOP_DELAY_MS = 12000; // para a gravação 12s após o fim do movimento

// Filtro usado pela puxada única do StreamingService para produzir os quadros de análise.
// Fica aqui para que o formato do pipe e o parser de quadros nunca saiam de sincronia.
export function motionVf(): string {
  return `fps=3,scale=${W}:${H},format=gray`;
}

interface MotionState {
  camera: Camera;
  config: DetectionConfig;
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

  // Consome os quadros cinza da PUXADA ÚNICA do StreamingService (pipe:4), em vez de
  // abrir a própria sessão RTSP.
  //
  // ANTES este serviço spawnava o próprio FFmpeg contra a câmera. Isso era uma 2ª sessão
  // RTSP concorrente (câmeras XM servem pouquíssimas) e, pior, escrevia no MESMO arquivo
  // `liveframes/<id>.jpg` que o streaming também escreve — duas escritas simultâneas no
  // mesmo JPEG corrompiam os snapshots. Agora a análise usa a imagem já decodificada.
  attachStream(camera: Camera, config: DetectionConfig, stream: NodeJS.ReadableStream): void {
    this.detach(camera.id); // encerra qualquer alimentação anterior
    const state: MotionState = {
      camera,
      config,
      prev: null,
      buffer: Buffer.alloc(0),
      lastEventAt: 0,
      recordStopTimer: null,
      recording: false,
    };
    this.active.set(camera.id, state);
    stream.on('data', (chunk: Buffer) => this.onData(camera.id, chunk));
    insertCameraLog(
      camera.id,
      camera.name,
      'info',
      `Detecção de movimento de "${camera.name}" iniciada`,
      `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nSensibilidade: ${config.sensitivity} (limiar: ${sensitivityToThreshold(config.sensitivity).toFixed(1)})\nGravar movimento: ${config.recordMotion ? 'sim' : 'não'}\nCapturar snapshot: ${config.captureSnapshot ? 'sim' : 'não'}\n\nA análise usa os quadros da puxada única (320x180 a 3 fps), sem abrir uma segunda sessão RTSP na câmera.`,
      'detection',
    );
  }

  // Encerra a análise sem log (uso interno: troca de alimentação).
  private detach(cameraId: string): void {
    const state = this.active.get(cameraId);
    if (!state) return;
    this.active.delete(cameraId);
    if (state.recordStopTimer) clearTimeout(state.recordStopTimer);
  }

  stop(cameraId: string): void {
    const state = this.active.get(cameraId);
    if (!state) return;
    insertCameraLog(
      cameraId,
      state.camera.name,
      'info',
      `Detecção de movimento de "${state.camera.name}" interrompida`,
      `Câmera: ${state.camera.name}\nIP: ${state.camera.ip}:${state.camera.port}\nUsuário: ${state.camera.username || '—'}\n\nA detecção de movimento foi interrompida intencionalmente.`,
      'detection',
    );
    this.detach(cameraId); // não há processo próprio para matar: a fonte é a puxada única
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
        try {
          recordingService.start(state.camera, 'motion', 'motion');
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

    if (state.config.captureSnapshot) {
      const s = getSettings();
      void captureDetectionSnapshot(state.camera, 'motion', score, s.snapshotsPath, s.snapshotsMaxCount);
    }
  }
}

export const motionDetectionService = new MotionDetectionService();
