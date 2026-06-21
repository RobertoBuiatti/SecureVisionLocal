import type { Camera, PTZTour, PTZTourStatus } from '../../src/shared/types';
import { gotoPresetOnvif } from './ptz';
import { getDb } from './db';
import { getCamera } from './cameraRepository';
import { getTour } from './ptzRepository';

interface ActiveTour {
  tourId: string;
  camera: Camera;
  tour: PTZTour;
  stepIndex: number;
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}

// Executa uma rota PTZ em ciclo infinito: vai ao preset, aguarda o tempo de
// permanência (dwell), avança para o próximo e recomeça ao chegar ao fim.
class TourRunner {
  private active = new Map<string, ActiveTour>();

  start(camera: Camera, tour: PTZTour, persist = true): boolean {
    if (!tour.steps.length) return false;
    this.stop(camera.id); // garante um único ciclo por câmera

    const state: ActiveTour = {
      tourId: tour.id,
      camera,
      tour,
      stepIndex: 0,
      timer: null,
      stopped: false,
    };
    this.active.set(camera.id, state);
    if (persist) this.persistActive(camera.id, tour.id);
    void this.runStep(camera.id);
    return true;
  }

  stop(cameraId: string): void {
    const state = this.active.get(cameraId);
    this.clearPersisted(cameraId);
    if (!state) return;
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    this.active.delete(cameraId);
  }

  // Retoma rotas que estavam rodando antes de fechar o software.
  resumePersisted(): void {
    let rows: { cameraId: string; tourId: string }[] = [];
    try {
      rows = getDb().prepare('SELECT cameraId, tourId FROM active_tours').all() as typeof rows;
    } catch {
      return;
    }
    for (const row of rows) {
      const camera = getCamera(row.cameraId);
      const tour = getTour(row.tourId);
      if (camera && tour) {
        this.start(camera, tour, false); // já está persistido
      } else {
        this.clearPersisted(row.cameraId);
      }
    }
  }

  private persistActive(cameraId: string, tourId: string): void {
    try {
      getDb()
        .prepare(
          `INSERT INTO active_tours (cameraId, tourId) VALUES (?, ?)
           ON CONFLICT(cameraId) DO UPDATE SET tourId=excluded.tourId`,
        )
        .run(cameraId, tourId);
    } catch {
      /* noop */
    }
  }

  private clearPersisted(cameraId: string): void {
    try {
      getDb().prepare('DELETE FROM active_tours WHERE cameraId = ?').run(cameraId);
    } catch {
      /* noop */
    }
  }

  status(cameraId: string): PTZTourStatus {
    const state = this.active.get(cameraId);
    return {
      cameraId,
      running: !!state,
      tourId: state?.tourId ?? null,
      stepIndex: state?.stepIndex ?? 0,
    };
  }

  private async runStep(cameraId: string): Promise<void> {
    const state = this.active.get(cameraId);
    if (!state || state.stopped) return;

    const step = state.tour.steps[state.stepIndex];
    // Move para a posição do passo atual (best-effort; erros não param o ciclo).
    await gotoPresetOnvif(state.camera, step.presetToken);

    if (state.stopped || !this.active.has(cameraId)) return;

    const dwellMs = Math.max(1, step.dwellSeconds) * 1000;
    state.timer = setTimeout(() => {
      const s = this.active.get(cameraId);
      if (!s || s.stopped) return;
      s.stepIndex = (s.stepIndex + 1) % s.tour.steps.length; // volta ao início (ciclo)
      void this.runStep(cameraId);
    }, dwellMs);
  }

  // Encerra os ciclos em memória SEM apagar a persistência (usado ao fechar o
  // software, para que as rotas em execução sejam retomadas na próxima abertura).
  stopAll(): void {
    for (const state of this.active.values()) {
      state.stopped = true;
      if (state.timer) clearTimeout(state.timer);
    }
    this.active.clear();
  }
}

export const tourRunner = new TourRunner();
