import { getReferenceMarks } from './referenceMarksRepository';
import { captureGrayFrame, captureGrayFromLive, ANALYSIS_SIZE, frameDistance } from './snapshotService';
import { controlPtz, continuousMoveVector } from './ptz';
import type { Camera, ReferenceMark } from '../../src/shared/types';
import { injectCredentials } from './onvifInfo';

const SEARCH_RANGE = 24;
const MATCH_THRESHOLD = 0.35;
const FEATURE_MIN_VARIANCE = 400;

interface MarkMatch {
  mark: ReferenceMark;
  found: boolean;
  currentX: number;
  currentY: number;
  currentDistLeft: number;
  currentDistTop: number;
}

interface VerificationResult {
  adjusted: boolean;
  dx: number;
  dy: number;
  confidence: number;
  markResults: MarkMatch[];
}

interface SuggestedFeature {
  type: 'line' | 'zone';
  points: { x: number; y: number }[];
  expectedDistanceLeft: number;
  expectedDistanceTop: number;
  tolerance: number;
}

// Detecta feições (features) de alto contraste na imagem de referência de um preset
// e sugere pontos de referência automáticos.
// A estratégia busca as bordas (pontas) e o centro da imagem — regiões com maior
// riqueza visual para servir como marcas de alinhamento — em vez de varrer em grade.
export async function detectFeatures(refPath: string): Promise<SuggestedFeature[]> {
  const gray = await loadRefGray(refPath);
  if (!gray) return [];

  const side = ANALYSIS_SIZE;
  const grad = computeGradientMagnitude(gray, side);

  // Divide a imagem em 5 regiões estratégicas: 4 cantos + centro.
  // Cada região busca o ponto de maior gradiente (borda mais forte) dentro dela.
  const regions: { name: string; x1: number; y1: number; x2: number; y2: number }[] = [
    { name: 'top-left',     x1: 0,          y1: 0,          x2: side / 2, y2: side / 2 },
    { name: 'top-right',    x1: side / 2,   y1: 0,          x2: side,     y2: side / 2 },
    { name: 'bottom-left',  x1: 0,          y1: side / 2,   x2: side / 2, y2: side },
    { name: 'bottom-right', x1: side / 2,   y1: side / 2,   x2: side,     y2: side },
    { name: 'center',       x1: side * 0.25, y1: side * 0.25, x2: side * 0.75, y2: side * 0.75 },
  ];

  // Margem de segurança: evita que o ponto fique colado na borda da região vizinha.
  const MARGIN = 4;
  const candidates: { gx: number; gy: number; score: number }[] = [];

  for (const reg of regions) {
    let bestX = 0;
    let bestY = 0;
    let bestScore = -1;
    for (let y = reg.y1 + MARGIN; y < reg.y2 - MARGIN; y++) {
      for (let x = reg.x1 + MARGIN; x < reg.x2 - MARGIN; x++) {
        const g = grad[y * side + x];
        if (g > bestScore) {
          bestScore = g;
          bestX = x;
          bestY = y;
        }
      }
    }
    if (bestScore > 0) {
      candidates.push({ gx: bestX, gy: bestY, score: bestScore });
    }
  }

  // Ordena por força do gradiente (decrescente) e limita a 6 marcas.
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 6);

  const features: SuggestedFeature[] = top.map((c) => {
    const cx = Math.max(0, Math.min(1, c.gx / side));
    const cy = Math.max(0, Math.min(1, c.gy / side));
    const size = 0.06;
    return {
      type: 'zone',
      points: [
        { x: cx - size, y: cy - size },
        { x: cx + size, y: cy - size },
        { x: cx + size, y: cy + size },
        { x: cx - size, y: cy + size },
      ],
      expectedDistanceLeft: Math.round(c.gx),
      expectedDistanceTop: Math.round(c.gy),
      tolerance: 10,
    };
  });

  return features;
}

// Verifica a posição atual da câmera contra as marcas de referência do preset.
// Retorna deslocamento médio (dx, dy) entre a posição esperada e a atual.
export async function verifyWithReferences(
  camera: Camera,
  presetId: string,
  refPath: string,
): Promise<VerificationResult> {
  const marks = getReferenceMarks(presetId);
  if (!marks.length) {
    return { adjusted: false, dx: 0, dy: 0, confidence: 1, markResults: [] };
  }

  const refGray = await loadRefGray(refPath);
  if (!refGray) {
    return { adjusted: false, dx: 0, dy: 0, confidence: 0, markResults: [] };
  }

  const side = ANALYSIS_SIZE;
  // Conexão única ESTRITA: consome só o liveFrame compartilhado. Sem quadro fresco →
  // null (não abre RTSP); o chamador registra o motivo.
  const currentGray = await captureGrayFromLive(camera.id, 3);
  if (!currentGray) {
    return { adjusted: false, dx: 0, dy: 0, confidence: 0, markResults: [] };
  }

  const markResults: MarkMatch[] = [];
  let totalDx = 0;
  let totalDy = 0;
  let validMarks = 0;

  for (const mark of marks) {
    const template = extractTemplate(refGray, side, mark);
    if (!template) continue;

    const match = findTemplateInFrame(template, currentGray, side, mark);
    markResults.push(match);

    if (match.found) {
      const expectedLeft = mark.expectedDistanceLeft;
      const expectedTop = mark.expectedDistanceTop;
      const dLeft = match.currentDistLeft - expectedLeft;
      const dTop = match.currentDistTop - expectedTop;

      if (Math.abs(dLeft) > mark.tolerance || Math.abs(dTop) > mark.tolerance) {
        totalDx += dLeft;
        totalDy += dTop;
        validMarks++;
      }
    }
  }

  if (validMarks === 0) {
    return { adjusted: false, dx: 0, dy: 0, confidence: 1, markResults };
  }

  const avgDx = totalDx / validMarks;
  const avgDy = totalDy / validMarks;
  const confidence = Math.min(1, validMarks / marks.length);

  return {
    adjusted: Math.abs(avgDx) > 1 || Math.abs(avgDy) > 1,
    dx: Math.round(avgDx),
    dy: Math.round(avgDy),
    confidence,
    markResults,
  };
}

// Aplica movimento PTZ corretivo baseado no deslocamento calculado.
// Converte deslocamento em pixels (grade 128) para movimento PTZ proporcional.
// Move diagonalmente (x/y simultâneos) em vez de sequencial, com duração proporcional
// ao deslocamento.
export async function fineTune(camera: Camera, dx: number, dy: number): Promise<boolean> {
  if (dx === 0 && dy === 0) return false;
  if (!camera.hasPTZ) return false;

  const magnitude = Math.sqrt(dx * dx + dy * dy);
  const speed = Math.min(25, Math.max(5, Math.round(magnitude * 1.5)));
  const duration = Math.max(100, Math.min(600, Math.round(magnitude * 20)));

  // Move diagonalmente: x/y simultâneos, mais preciso que X→Y sequencial
  // ONVIF: +x = direita, +y = cima → dy precisa ser invertido (imagem: +y = baixo)
  const normX = dx / magnitude;
  const normY = dy / magnitude;
  const x = clamp((normX * speed) / 100, -1, 1);
  const y = clamp((-normY * speed) / 100, -1, 1);

  await continuousMoveVector(camera, x, y);
  await sleep(duration);
  await controlPtz(camera, { action: 'stop' });

  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// --- Funções auxiliares ---

function computeGradientMagnitude(gray: Buffer, side: number): Float64Array {
  const grad = new Float64Array(side * side);
  for (let y = 1; y < side - 1; y++) {
    for (let x = 1; x < side - 1; x++) {
      const idx = y * side + x;
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[(y + 1) * side + x] - gray[(y - 1) * side + x];
      grad[idx] = gx * gx + gy * gy;
    }
  }
  return grad;
}

function loadRefGray(refPath: string): Promise<Buffer | null> {
  return captureGrayFrame(refPath, true);
}

function extractTemplate(gray: Buffer, side: number, mark: ReferenceMark): Buffer | null {
  const { points } = mark;
  const xs = points.map((p) => Math.round(p.x * side));
  const ys = points.map((p) => Math.round(p.y * side));

  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(side - 1, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(side - 1, Math.max(...ys));

  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  if (tw < 4 || th < 4) return null;

  const tmpl = Buffer.alloc(tw * th);
  for (let y = 0; y < th; y++) {
    const srcOff = (minY + y) * side + minX;
    gray.copy(tmpl, y * tw, srcOff, srcOff + tw);
  }
  return tmpl;
}

function findTemplateInFrame(template: Buffer, frame: Buffer, side: number, mark: ReferenceMark): MarkMatch {
  const tw = Math.round(Math.abs(mark.points[1].x - mark.points[0].x) * side);
  const th = Math.round(Math.abs(mark.points[2].y - mark.points[0].y) * side);
  const actualTw = Math.max(4, Math.min(tw || 8, side));
  const actualTh = Math.max(4, Math.min(th || 8, side));

  // expectedDistanceLeft/Top são gravados como o CENTRO da marca (ver o editor e
  // detectFeatures). O casamento de template usa o canto superior-esquerdo, então
  // convertemos centro→canto aqui (e canto→centro no retorno, em currentDist*), para
  // que o delta esperado-vs-atual fique sem viés sistemático.
  const expectedCol = Math.round(mark.expectedDistanceLeft - actualTw / 2);
  const expectedRow = Math.round(mark.expectedDistanceTop - actualTh / 2);
  const searchMinX = Math.max(0, expectedCol - SEARCH_RANGE);
  const searchMaxX = Math.min(side - actualTw, expectedCol + SEARCH_RANGE);
  const searchMinY = Math.max(0, expectedRow - SEARCH_RANGE);
  const searchMaxY = Math.min(side - actualTh, expectedRow + SEARCH_RANGE);

  let bestScore = -Infinity;
  let bestX = expectedCol;
  let bestY = expectedRow;

  for (let sy = searchMinY; sy <= searchMaxY; sy += 2) {
    for (let sx = searchMinX; sx <= searchMaxX; sx += 2) {
      const score = templateMatchAt(template, frame, side, actualTw, actualTh, sx, sy);
      if (score > bestScore) {
        bestScore = score;
        bestX = sx;
        bestY = sy;
      }
    }
  }

  if (bestScore > -Infinity) {
    for (let sy = Math.max(searchMinY, bestY - 1); sy <= Math.min(searchMaxY, bestY + 1); sy++) {
      for (let sx = Math.max(searchMinX, bestX - 1); sx <= Math.min(searchMaxX, bestX + 1); sx++) {
        const score = templateMatchAt(template, frame, side, actualTw, actualTh, sx, sy);
        if (score > bestScore) {
          bestScore = score;
          bestX = sx;
          bestY = sy;
        }
      }
    }
  }

  const found = bestScore > MATCH_THRESHOLD;

  return {
    mark,
    found,
    currentX: bestX,
    currentY: bestY,
    currentDistLeft: found ? bestX + actualTw / 2 : mark.expectedDistanceLeft,
    currentDistTop: found ? bestY + actualTh / 2 : mark.expectedDistanceTop,
  };
}

function templateMatchAt(template: Buffer, frame: Buffer, side: number, tw: number, th: number, sx: number, sy: number): number {
  let sumT = 0;
  let sumF = 0;
  let n = 0;

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      sumT += template[y * tw + x];
      sumF += frame[(sy + y) * side + (sx + x)];
      n++;
    }
  }
  if (n === 0) return -Infinity;

  const meanT = sumT / n;
  const meanF = sumF / n;

  let num = 0;
  let dT = 0;
  let dF = 0;

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const vt = template[y * tw + x] - meanT;
      const vf = frame[(sy + y) * side + (sx + x)] - meanF;
      num += vt * vf;
      dT += vt * vt;
      dF += vf * vf;
    }
  }

  if (dT === 0 || dF === 0) return -Infinity;
  return num / Math.sqrt(dT * dF);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
