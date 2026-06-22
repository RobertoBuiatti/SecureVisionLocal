import { Notification } from 'electron';
import type { Camera, PositionCheckResult, PTZDirection } from '../../src/shared/types';
import { listCameras, getCamera } from './cameraRepository';
import { listPresets, setPresetCheck, getTour } from './ptzRepository';
import { gotoPresetOnvif, updatePresetOnvif, controlPtz } from './ptz';
import {
  captureGrayFrame,
  captureGrayFrameMedian,
  frameDistance,
  frameDistanceCrop,
  ANALYSIS_SIZE,
} from './snapshotService';
import { getSettings } from './settings';
import { tourRunner } from './tourRunner';

// Distância (0..100, menor = mais parecido) acima disso = posição provavelmente errada.
// Usa correlação normalizada (frameDistance), robusta a brilho — por isso o limiar é baixo.
const THRESHOLD = 12;
// Só tenta autocorrigir quando está CLARAMENTE deslocada (não em pequenas variações de
// luz/cena), evitando ficar "caçando" ruído e mexendo a câmera à toa.
const REALIGN_TRIGGER = 22;
const SETTLE_MS = 4000; // tempo para a câmera estabilizar após mover
const MEASURE_SAMPLES = 3; // quadros por medição (mediana) — resistência a ruído

const CHECK_HOURS = [6, 18]; // horários (2x ao dia) da verificação automática

// Busca visual (autocorreção): descida pelo gradiente em múltiplas escalas (grosso→fino).
// Entre cada teste a câmera SEMPRE volta ao preset por recall absoluto (gotoPreset),
// nunca por disparo oposto — assim não acumula erro e não "se perde".
const SEARCH_SPEED = 18; // velocidade baixa (movimento devagar e controlado)
const SEARCH_SETTLE_MS = 1100; // espera estabilizar antes de capturar
const SEARCH_MAX_ITER = 3; // limite de passos por escala (busca curta e segura)
const SEARCH_EPS = 1.5; // melhora MÍNIMA (acima do ruído) para aceitar um movimento
const MIN_GAIN = 4; // ganho mínimo sobre o ponto inicial para regravar o preset

// Níveis de casamento, do grosso ao fino. `crop` = fração central da imagem usada para
// medir (1.0 = imagem inteira; menor = recorte central, mais sensível a pequeno desvio).
// `ms` = duração do micro-movimento naquele nível (passo grande primeiro, fino depois).
//   1) imagem grande  → posicionamento grosseiro (acha a região certa, sem falso encaixe)
//   2) recorte médio   → ajuste
//   3) recorte interno → precisão fina (trava o ponto exato)
const SEARCH_LEVELS: { crop: number; ms: number }[] = [
  { crop: 1.0, ms: 600 },
  { crop: 0.6, ms: 300 },
  { crop: 0.35, ms: 150 },
];

interface PathStep {
  dir: PTZDirection;
  ms: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Verifica, por IA de imagem, se cada posição salva ainda corresponde à referência
// capturada quando o ponto foi criado e, se tiver saído do lugar, reposiciona a câmera
// até reencontrar exatamente aquela cena (autocorreção).
class PositionVerifier {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false; // verificação automática (todas as câmeras) em andamento
  private aborted = false; // sinal de cancelamento (ex.: app fechando)
  private busy = new Set<string>(); // câmeras com verificação em curso (lock por câmera)

  start(): void {
    this.aborted = false;
    if (this.timer) return;
    this.scheduleNext();
  }

  stop(): void {
    this.aborted = true; // interrompe loops de verificação/autocorreção em andamento
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
        if (this.aborted) break;
        if (camera.hasPTZ) await this.verifyCamera(camera);
      }
    } finally {
      this.running = false;
    }
  }

  // Percorre os presets com referência e compara a imagem atual com a salva.
  async verifyCamera(camera: Camera): Promise<PositionCheckResult[]> {
    // Lock por câmera: impede que a verificação manual e a automática (ou duas manuais)
    // disputem a mesma sessão ONVIF e façam a câmera se mover de forma errática.
    if (this.busy.has(camera.id)) return [];

    const presets = listPresets(camera.id).filter((p) => p.snapshotPath);
    if (!presets.length) return [];

    this.busy.add(camera.id);

    // Pausa a rota durante a verificação (e retoma depois, mesmo se algo falhar).
    const status = tourRunner.status(camera.id);
    const resumeTourId = status.running ? status.tourId : null;
    if (resumeTourId) tourRunner.stop(camera.id);

    const results: PositionCheckResult[] = [];
    const url = camera.subStreamUrl || camera.streamUrl;

    try {
      for (const preset of presets) {
        if (this.aborted) break;

        await gotoPresetOnvif(camera, preset.token);
        await sleep(SETTLE_MS);

        // Referência = imagem do ponto no momento em que foi criado.
        const ref = await captureGrayFrame(preset.snapshotPath as string, true);
        const cur = await captureGrayFrameMedian(url, false, MEASURE_SAMPLES);

        // Sem referência ou sem quadro atual (ex.: queda momentânea de rede): a posição
        // é INDETERMINADA. Nunca mexe a câmera "no escuro" — só registra e segue.
        if (!ref || !cur) {
          setPresetCheck(preset.id, false, 100);
          results.push({
            presetId: preset.id,
            presetName: preset.name,
            ok: false,
            score: 100,
            checkedAt: Date.now(),
            corrected: false,
          });
          continue;
        }

        let score = frameDistance(cur, ref);
        let ok = score < THRESHOLD;
        let corrected = false;

        // Só corrige se estiver CLARAMENTE deslocada (drift real), não em pequenas
        // diferenças de luz/cena. A câmera já está no preset (gotoPreset acima).
        if (!ok && score >= REALIGN_TRIGGER && !this.aborted) {
          const realign = await this.realign(camera, preset.token, ref, url, score);
          ok = realign.ok;
          corrected = realign.corrected;
          score = realign.score;
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

        // Saiu do lugar e a autocorreção não conseguiu trazer de volta → avisa o operador.
        if (!ok && !corrected) this.warn(camera, preset.name);
      }
    } finally {
      this.busy.delete(camera.id);
      if (resumeTourId) {
        const tour = getTour(resumeTourId);
        if (tour) tourRunner.start(camera, tour);
      }
    }
    return results;
  }

  async verifyCameraById(cameraId: string): Promise<PositionCheckResult[]> {
    const camera = getCamera(cameraId);
    if (!camera) return [];
    return this.verifyCamera(camera);
  }

  // Micro-movimento lento numa direção, com duração (passo) configurável, e parada.
  private async moveBurst(camera: Camera, direction: PTZDirection, burstMs: number): Promise<void> {
    await controlPtz(camera, { action: 'move', direction, speed: SEARCH_SPEED });
    await sleep(burstMs);
    await controlPtz(camera, { action: 'stop' });
  }

  // Mede a distância do quadro atual (mediana de N amostras) em relação à referência.
  // Retorna null se não conseguiu capturar — o chamador NÃO deve mover nesse caso.
  private async distanceNow(url: string, ref: Buffer): Promise<number | null> {
    const f = await captureGrayFrameMedian(url, false, MEASURE_SAMPLES);
    return f ? frameDistance(f, ref) : null;
  }

  // Mede, de UMA captura, a distância da imagem INTEIRA e a de um recorte central
  // (fração `crop`). A imagem inteira valida a reconvergência; o recorte guia o ajuste
  // fino. Retorna null se a captura falhou (não mover nesse caso).
  private async measureAt(
    url: string,
    ref: Buffer,
    crop: number,
  ): Promise<{ full: number; crop: number } | null> {
    const f = await captureGrayFrameMedian(url, false, MEASURE_SAMPLES);
    if (!f) return null;
    return {
      full: frameDistance(f, ref),
      crop: frameDistanceCrop(f, ref, ANALYSIS_SIZE, crop),
    };
  }

  // Posiciona a câmera no "melhor ponto" conhecido: volta ao preset por recall ABSOLUTO
  // (posição garantida, sem acúmulo de erro) e re-aplica os passos já aceitos. O preset
  // original NUNCA é alterado durante a busca — só ao final, e só se valer a pena.
  private async goToPath(camera: Camera, token: string, path: PathStep[]): Promise<void> {
    await gotoPresetOnvif(camera, token);
    await sleep(SEARCH_SETTLE_MS);
    for (const step of path) {
      await this.moveBurst(camera, step.dir, step.ms);
      await sleep(SEARCH_SETTLE_MS);
    }
  }

  // Autocorreção MULTI-ESCALA: procura a posição da imagem de referência do grosso ao
  // fino. A imagem inteira posiciona grosseiramente (acha a região, sem falso encaixe);
  // recortes centrais cada vez menores afinam a precisão (cada nível parte do resultado
  // do anterior). Diferenças-chave que a tornam SEGURA (nunca estraga um preset bom):
  //   1. Toda medição usa a MEDIANA de vários quadros (resistente a ruído de cena).
  //   2. Os passos aceitos ficam só em memória (path); o preset original permanece
  //      intacto durante toda a busca — se a busca falhar, a câmera volta para ele.
  //   3. O preset só é REGRAVADO (uma única vez, no fim) quando a IMAGEM INTEIRA volta a
  //      bater com a referência (full < THRESHOLD) com ganho real sobre o início.
  // Resultado: ou a posição é genuinamente corrigida, ou nada muda. Nunca um meio-termo.
  private async realign(
    camera: Camera,
    token: string,
    ref: Buffer,
    url: string,
    baseline: number,
  ): Promise<{ ok: boolean; score: number; corrected: boolean }> {
    const directions: PTZDirection[] = ['left', 'right', 'up', 'down'];
    const path: PathStep[] = [];

    for (const level of SEARCH_LEVELS) {
      if (this.aborted) break;

      // Posiciona no melhor ponto atual e mede neste nível (recorte) + imagem inteira.
      await this.goToPath(camera, token, path);
      const start = await this.measureAt(url, ref, level.crop);
      if (!start) break; // captura falhou → não arrisca mexer
      if (start.full < THRESHOLD) break; // imagem inteira já bate → não precisa afinar mais
      let best = start.crop;

      for (let iter = 0; iter < SEARCH_MAX_ITER; iter++) {
        if (this.aborted) break;

        let bestDir: PTZDirection | null = null;
        let bestDirScore = best;
        for (const d of directions) {
          if (this.aborted) break;
          await this.goToPath(camera, token, path); // parte sempre do melhor ponto atual
          await this.moveBurst(camera, d, level.ms);
          await sleep(SEARCH_SETTLE_MS);
          const m = await this.measureAt(url, ref, level.crop);
          // Só conta como ganho se superar o ruído (SEARCH_EPS). null = captura falhou.
          if (m && m.crop < bestDirScore - SEARCH_EPS) {
            bestDirScore = m.crop;
            bestDir = d;
          }
        }
        if (!bestDir) break; // nenhuma direção melhora de verdade → próximo nível (mais fino)
        path.push({ dir: bestDir, ms: level.ms });
        best = bestDirScore;
      }
    }

    // Avalia o resultado pela IMAGEM INTEIRA (robusta contra falso encaixe de recorte).
    await this.goToPath(camera, token, path);
    const finalFull = path.length && !this.aborted ? await this.distanceNow(url, ref) : null;

    // Confirma SOMENTE se a imagem inteira voltou a bater e melhorou de verdade sobre o
    // início. Aí sim regrava o preset UMA vez, travando a posição corrigida.
    if (finalFull != null && finalFull < THRESHOLD && finalFull <= baseline - MIN_GAIN) {
      await updatePresetOnvif(camera, token); // nova âncora absoluta = posição corrigida
      return { ok: true, score: finalFull, corrected: true };
    }

    // Não confiável → volta ao preset ORIGINAL (intacto) e NÃO regrava nada.
    await gotoPresetOnvif(camera, token);
    await sleep(SEARCH_SETTLE_MS);
    return { ok: false, score: baseline, corrected: false };
  }

  // Notificação nativa quando uma posição saiu do lugar e não pôde ser corrigida.
  private warn(camera: Camera, presetName: string): void {
    try {
      if (!getSettings().notificationsEnabled || !Notification.isSupported()) return;
      new Notification({
        title: 'SecureVision — Posição',
        body: `A posição "${presetName}" de ${camera.name} saiu do lugar e não pôde ser corrigida automaticamente.`,
      }).show();
    } catch {
      /* nunca derruba a verificação por causa de uma notificação */
    }
  }
}

export const positionVerifier = new PositionVerifier();
