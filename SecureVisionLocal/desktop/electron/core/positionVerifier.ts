import type { Camera, PositionCheckResult, PTZDirection } from '../../src/shared/types';
import { listCameras, getCamera } from './cameraRepository';
import { listPresets, setPresetCheck, getTour } from './ptzRepository';
import { gotoPresetOnvif, updatePresetOnvif, controlPtz } from './ptz';
import { captureGrayFrame, meanDiff } from './snapshotService';
import { tourRunner } from './tourRunner';

const THRESHOLD = 28; // diferença média acima disso = posição provavelmente errada
const SETTLE_MS = 4000; // tempo para a câmera estabilizar após mover
const CHECK_HOURS = [6, 18]; // horários (2x ao dia) da verificação automática

// Busca visual (autocorreção) — movimentos lentos e curtos.
const SEARCH_SPEED = 15; // velocidade baixa (movimento devagar)
const SEARCH_BURST_MS = 350; // duração de cada micro-movimento
const SEARCH_SETTLE_MS = 900; // espera estabilizar antes de capturar
const SEARCH_MAX_ITER = 18; // limite de passos da busca

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Verifica, por IA de imagem, se cada posição salva ainda corresponde à referência.
class PositionVerifier {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // Agenda a próxima verificação no próximo horário fixo (06:00 / 18:00).
  private scheduleNext(): void {
    const now = new Date();
    let best = Infinity;
    for (const hour of CHECK_HOURS) {
      const t = new Date(now);
      t.setHours(hour, 0, 0, 0);
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1); // já passou hoje → amanhã
      best = Math.min(best, t.getTime() - now.getTime());
    }
    this.timer = setTimeout(() => {
      void this.verifyAll();
      this.scheduleNext();
    }, best);
  }

  async verifyAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const camera of listCameras()) {
        if (camera.hasPTZ) await this.verifyCamera(camera);
      }
    } finally {
      this.running = false;
    }
  }

  // Percorre os presets com referência e compara a imagem atual com a salva.
  async verifyCamera(camera: Camera): Promise<PositionCheckResult[]> {
    const presets = listPresets(camera.id).filter((p) => p.snapshotPath);
    if (!presets.length) return [];

    // Pausa a rota durante a verificação (e retoma depois).
    const status = tourRunner.status(camera.id);
    const resumeTourId = status.running ? status.tourId : null;
    if (resumeTourId) tourRunner.stop(camera.id);

    const results: PositionCheckResult[] = [];
    const url = camera.subStreamUrl || camera.streamUrl;

    for (const preset of presets) {
      await gotoPresetOnvif(camera, preset.token);
      // eslint-disable-next-line no-await-in-loop
      await sleep(SETTLE_MS);
      const [cur, ref] = await Promise.all([
        captureGrayFrame(url, false),
        captureGrayFrame(preset.snapshotPath as string, true),
      ]);
      let ok = false;
      let score = 255;
      let corrected = false;
      if (cur && ref) {
        score = meanDiff(cur, ref);
        ok = score < THRESHOLD;
      }

      // Posição errada → busca visual lenta pela imagem de referência.
      if (!ok && ref) {
        const realign = await this.realign(camera, preset.token, ref, url);
        if (realign.ok) {
          ok = true;
          corrected = true;
          score = realign.score;
        } else {
          score = Math.min(score, realign.score);
        }
      }

      setPresetCheck(preset.id, ok, score);
      results.push({
        presetId: preset.id,
        presetName: preset.name,
        ok,
        score: Math.round(score),
        checkedAt: Date.now(),
        corrected,
      });
    }

    if (resumeTourId) {
      const tour = getTour(resumeTourId);
      if (tour) tourRunner.start(camera, tour);
    }
    return results;
  }

  async verifyCameraById(cameraId: string): Promise<PositionCheckResult[]> {
    const camera = getCamera(cameraId);
    if (!camera) return [];
    return this.verifyCamera(camera);
  }

  // Micro-movimento lento numa direção e parada.
  private async moveBurst(camera: Camera, direction: PTZDirection): Promise<void> {
    await controlPtz(camera, { action: 'move', direction, speed: SEARCH_SPEED });
    await sleep(SEARCH_BURST_MS);
    await controlPtz(camera, { action: 'stop' });
  }

  // Busca a posição salva movendo a câmera devagar e comparando com a referência
  // (subida de encosta: vai na direção que mais aproxima a imagem da referência).
  private async realign(
    camera: Camera,
    token: string,
    ref: Buffer,
    url: string,
  ): Promise<{ ok: boolean; score: number }> {
    const directions: PTZDirection[] = ['left', 'right', 'up', 'down'];
    const opposite: Record<string, PTZDirection> = {
      left: 'right',
      right: 'left',
      up: 'down',
      down: 'up',
    };

    let cur = await captureGrayFrame(url, false);
    let best = cur ? meanDiff(cur, ref) : 255;

    for (let iter = 0; iter < SEARCH_MAX_ITER && best >= THRESHOLD; iter++) {
      let improved = false;
      for (const d of directions) {
        await this.moveBurst(camera, d);
        await sleep(SEARCH_SETTLE_MS);
        const f = await captureGrayFrame(url, false);
        const diff = f ? meanDiff(f, ref) : 255;
        if (diff < best - 0.5) {
          best = diff; // melhorou: mantém a nova posição e recomeça as direções
          improved = true;
          break;
        }
        // não melhorou: volta ao ponto anterior
        await this.moveBurst(camera, opposite[d]);
        await sleep(SEARCH_SETTLE_MS / 2);
      }
      if (!improved) break; // mínimo local — não há direção que aproxime mais
    }

    const ok = best < THRESHOLD;
    if (ok) {
      // Encontrou a posição: regrava o preset na posição corrigida (autocorreção).
      await updatePresetOnvif(camera, token);
    }
    return { ok, score: best };
  }
}

export const positionVerifier = new PositionVerifier();
