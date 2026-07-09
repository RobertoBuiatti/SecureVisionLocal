import { Notification } from 'electron';
import type { Camera, PositionCheckResult, PTZDirection } from '../../src/shared/types';
import { listCameras, getCamera } from './cameraRepository';
import { listPresets, setPresetCheck, getTour } from './ptzRepository';
import { gotoPresetOnvif, updatePresetOnvif, controlPtz } from './ptz';
import { getReferenceMarks } from './referenceMarksRepository';
import { verifyWithReferences, fineTune } from './referenceVerifier';
import {
  captureGrayFrame,
  captureGrayFrameMedian,
  frameDistance,
  frameDistanceCrop,
  estimateShift,
  ANALYSIS_SIZE,
} from './snapshotService';
import { getSettings } from './settings';
import { tourRunner } from './tourRunner';
import { aiVerifyPosition, computeAndSaveReferenceEmbedding } from './ai/aiVerifier';
import { injectCredentials } from './onvifInfo';

// Distância (0..100, menor = mais parecido) acima disso = posição provavelmente errada.
// Usa correlação normalizada (frameDistance), robusta a brilho — por isso o limiar é baixo.
const THRESHOLD = 12;
// A autocorreção tenta qualquer posição com score >= THRESHOLD. As salvaguardas
// internas (SEARCH_EPS, MIN_GAIN, validação final pela imagem inteira) evitam que
// pequenas variações de luz/cena ou ruído provoquem correções desnecessárias.
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

// Direção oposta (fallback para câmeras com pan/tilt espelhado ou montagem invertida).
const OPPOSITE: Record<PTZDirection, PTZDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
  'up-left': 'down-right',
  'up-right': 'down-left',
  'down-left': 'up-right',
  'down-right': 'up-left',
};

// Converte o deslocamento estimado da imagem em direções PTZ candidatas, em ordem de
// probabilidade. Convenção de imagem: a referência deslocada para a DIREITA no quadro
// atual (dx>0) volta ao centro com pan para a DIREITA (pan direito move a cena para a
// esquerda); referência mais ABAIXO (dy>0) volta com tilt para BAIXO. A direção oposta
// entra como 2ª candidata (câmeras espelhadas); o eixo secundário completa a lista.
function directionsFromShift(dx: number, dy: number): PTZDirection[] {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 1 && ay < 1) return ['left', 'right', 'up', 'down']; // sem estimativa útil

  const horiz: PTZDirection = dx > 0 ? 'right' : 'left';
  const vert: PTZDirection = dy > 0 ? 'down' : 'up';

  let primary: PTZDirection;
  if (ax >= 2 * ay) primary = horiz; // desvio essencialmente horizontal
  else if (ay >= 2 * ax) primary = vert; // essencialmente vertical
  else primary = `${vert}-${horiz}` as PTZDirection; // diagonal (ex.: 'down-right')

  const ordered: PTZDirection[] = [primary, OPPOSITE[primary]];
  // Completa com os eixos individuais ainda não presentes (máx. 4 tentativas).
  for (const d of [horiz, vert, OPPOSITE[horiz], OPPOSITE[vert]]) {
    if (ordered.length >= 4) break;
    if (!ordered.includes(d)) ordered.push(d);
  }
  return ordered;
}

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
    const rawUrl = camera.subStreamUrl || camera.streamUrl;
    const url = injectCredentials(rawUrl, camera.username, camera.password);

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

        // --- AI Cross-Check: verificação semântica por embedding YOLO ---
        // ZNCC compara pixels e é sensível a iluminação (sol, nuvens, modo noturno).
        // O embedding YOLO captura o CONTEÚDO da cena (objetos, posições) de forma
        // robusta a essas variações. Se a IA confirmar que a cena é a mesma, o score
        // ZNCC é ignorado — a posição está correta, só mudou a luz.
        if (!ok && !this.aborted) {
          const aiSim = await aiVerifyPosition(url, preset.id);
          if (aiSim !== null && aiSim > 0.7) {
            score = 0;
            ok = true;
          }
        }

        // --- ETAPA 1: Correção com marcas de referência (desvios moderados) ---
        // Para scores entre THRESHOLD e MODERATE_SCORE, tenta primeiro o ajuste fino
        // por template matching das marcas (mais preciso que a busca global para
        // pequenos desvios). Se não houver marcas ou não funcionar, cai na Etapa 2.
        const MODERATE_SCORE = 25;
        let marksFineTuned = false;

        if (!ok && score >= THRESHOLD && score < MODERATE_SCORE && !this.aborted) {
          const marks = getReferenceMarks(preset.id);
          if (marks.length > 0) {
            const refResult = await verifyWithReferences(camera, preset.id);
            if (refResult.adjusted && refResult.confidence > 0.5) {
              await fineTune(camera, refResult.dx, refResult.dy);
              await sleep(SETTLE_MS);
              const recheck = await captureGrayFrameMedian(url, false, MEASURE_SAMPLES);
              if (recheck) {
                const newScore = frameDistance(recheck, ref);
                if (newScore < THRESHOLD) {
                  score = newScore;
                  ok = true;
                  corrected = true;
                  marksFineTuned = true;
                  await updatePresetOnvif(camera, preset.token);
                } else if (newScore < score) {
                  // Melhorou mas não o suficiente — atualiza o baseline para a Etapa 2
                  score = newScore;
                }
              }
            }
          }
        }

        // --- ETAPA 2: Realinhamento global (busca visual multi-escala) ---
        // Só executa se ainda não está OK (marcas não resolveram ou desvio era grande).
        if (!ok && score >= THRESHOLD && !this.aborted) {
          const realign = await this.realign(camera, preset.token, ref, url, score);
          ok = realign.ok;
          corrected = corrected || realign.corrected;
          score = realign.score;
          // Se o realinhamento corrigiu a posição, atualiza o embedding AI de referência
          if (realign.corrected) {
            computeAndSaveReferenceEmbedding(url, preset.id).catch(() => {});
          }
        }

        // --- ETAPA 3: Refinamento fino com marcas de referência ---
        // Se o preset tem marcas e ainda não rodaram (ou rolaram na Etapa 1 só como
        // correção, mas o realinhamento global pode ter mudado a cena), tenta finar.
        if (ok && !this.aborted) {
          const marks = getReferenceMarks(preset.id);
          if (marks.length > 0 && !marksFineTuned) {
            const refResult = await verifyWithReferences(camera, preset.id);
            if (refResult.adjusted && refResult.confidence > 0.5) {
              await fineTune(camera, refResult.dx, refResult.dy);
              await sleep(SETTLE_MS);
              const finalCur = await captureGrayFrameMedian(url, false, MEASURE_SAMPLES);
              if (finalCur) {
                const newScore = frameDistance(finalCur, ref);
                // Se a segunda passada melhorou ainda mais, persiste
                if (newScore <= score) {
                  score = newScore;
                  ok = newScore < THRESHOLD;
                  corrected = true;
                  await updatePresetOnvif(camera, preset.token);
                }
              }
            }
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
  // (fração `crop`), devolvendo também o quadro (usado para estimar o deslocamento).
  // A imagem inteira valida a reconvergência; o recorte guia o ajuste fino.
  // Retorna null se a captura falhou (não mover nesse caso).
  private async measureAt(
    url: string,
    ref: Buffer,
    crop: number,
  ): Promise<{ full: number; crop: number; frame: Buffer } | null> {
    const f = await captureGrayFrameMedian(url, false, MEASURE_SAMPLES);
    if (!f) return null;
    return {
      full: frameDistance(f, ref),
      crop: frameDistanceCrop(f, ref, ANALYSIS_SIZE, crop),
      frame: f,
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

  // Autocorreção MULTI-ESCALA guiada por IMAGEM: compara o quadro atual com a foto de
  // referência capturada QUANDO O PONTO FOI CRIADO e reposiciona a câmera até
  // reencontrar aquela cena. A estimativa de deslocamento (estimateShift, correlação
  // de imagem) diz para ONDE a cena fugiu — a busca move direto na direção mais
  // provável (a oposta cobre montagem espelhada), em vez de tatear as 4 direções.
  // Recortes centrais cada vez menores afinam a precisão (cada nível parte do
  // resultado do anterior). Salvaguardas que a tornam SEGURA (nunca estraga um preset):
  //   1. Toda medição usa a MEDIANA de vários quadros (resistente a ruído de cena).
  //   2. Cada movimento só é ACEITO se melhorar a semelhança acima do ruído
  //      (SEARCH_EPS) — a estimativa sugere, a medição confirma.
  //   3. Os passos aceitos ficam só em memória (path); o preset original permanece
  //      intacto durante toda a busca — se a busca falhar, a câmera volta para ele.
  //   4. O preset só é REGRAVADO (uma única vez, no fim) quando a IMAGEM INTEIRA volta
  //      a bater com a referência (full < THRESHOLD) com ganho real sobre o início.
  // Resultado: ou a posição é genuinamente corrigida, ou nada muda. Nunca um meio-termo.
  private async realign(
    camera: Camera,
    token: string,
    ref: Buffer,
    url: string,
    baseline: number,
  ): Promise<{ ok: boolean; score: number; corrected: boolean }> {
    const path: PathStep[] = [];

    for (const level of SEARCH_LEVELS) {
      if (this.aborted) break;

      // Posiciona no melhor ponto atual e mede neste nível (recorte) + imagem inteira.
      await this.goToPath(camera, token, path);
      let atBest = await this.measureAt(url, ref, level.crop);
      if (!atBest) break; // captura falhou → não arrisca mexer
      if (atBest.full < THRESHOLD) break; // imagem inteira já bate → não precisa afinar mais

      for (let iter = 0; iter < SEARCH_MAX_ITER; iter++) {
        if (this.aborted || !atBest) break;

        // Estima para onde a cena se deslocou e ordena as direções candidatas.
        const shift = estimateShift(atBest.frame, ref);
        const candidates = shift
          ? directionsFromShift(shift.dx, shift.dy)
          : (['left', 'right', 'up', 'down'] as PTZDirection[]);

        // Aceita a PRIMEIRA candidata que melhora de verdade (menos movimentos que
        // testar todas); nenhuma melhora → passa ao próximo nível (mais fino).
        let accepted = false;
        for (const d of candidates) {
          if (this.aborted) break;
          await this.goToPath(camera, token, path); // parte sempre do melhor ponto atual
          await this.moveBurst(camera, d, level.ms);
          await sleep(SEARCH_SETTLE_MS);
          const m = await this.measureAt(url, ref, level.crop);
          // Só conta como ganho se superar o ruído (SEARCH_EPS). null = captura falhou.
          if (m && m.crop < atBest.crop - SEARCH_EPS) {
            path.push({ dir: d, ms: level.ms });
            atBest = m; // a câmera já está neste ponto (goToPath + burst = path)
            accepted = true;
            break;
          }
        }
        if (!accepted) break;
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
