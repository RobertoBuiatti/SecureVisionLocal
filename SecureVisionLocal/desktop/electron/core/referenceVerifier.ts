import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { getReferenceMarks } from './referenceMarksRepository';
import { captureGrayFrame, captureGrayFrameMedian, ANALYSIS_SIZE, frameDistance } from './snapshotService';
import { presetsSnapshotDir } from './snapshotService';
import { controlPtz } from './ptz';
import type { Camera, ReferenceMark } from '../../src/shared/types';

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
export async function detectFeatures(presetId: string): Promise<SuggestedFeature[]> {
  const refPath = join(presetsSnapshotDir(), `${presetId}.jpg`);
  const gray = await loadRefGray(refPath);
  if (!gray) return [];

  const side = ANALYSIS_SIZE;
  const grad = computeGradientMagnitude(gray, side);

  const features: SuggestedFeature[] = [];
  const step = 16;
  const windowSize = 12;

  for (let y = windowSize; y + windowSize < side; y += step) {
    for (let x = windowSize; x + windowSize < side; x += step) {
      let sumGrad = 0;
      let count = 0;
      for (let ky = -windowSize; ky <= windowSize; ky++) {
        for (let kx = -windowSize; kx <= windowSize; kx++) {
          sumGrad += grad[(y + ky) * side + (x + kx)];
          count++;
        }
      }
      const avgGrad = count > 0 ? sumGrad / count : 0;

      if (avgGrad > FEATURE_MIN_VARIANCE) {
        const cx = Math.max(0, Math.min(1, x / side));
        const cy = Math.max(0, Math.min(1, y / side));
        const size = 0.06;

        features.push({
          type: 'zone',
          points: [
            { x: cx - size, y: cy - size },
            { x: cx + size, y: cy - size },
            { x: cx + size, y: cy + size },
            { x: cx - size, y: cy + size },
          ],
          expectedDistanceLeft: Math.round(x * 100) / 100,
          expectedDistanceTop: Math.round(y * 100) / 100,
          tolerance: 10,
        });
      }
    }
  }

  return features.slice(0, 8);
}

// Verifica a posição atual da câmera contra as marcas de referência do preset.
// Retorna deslocamento médio (dx, dy) entre a posição esperada e a atual.
export async function verifyWithReferences(camera: Camera, presetId: string): Promise<VerificationResult> {
  const marks = getReferenceMarks(presetId);
  if (!marks.length) {
    return { adjusted: false, dx: 0, dy: 0, confidence: 1, markResults: [] };
  }

  const refPath = join(presetsSnapshotDir(), `${presetId}.jpg`);
  const refGray = await loadRefGray(refPath);
  if (!refGray) {
    return { adjusted: false, dx: 0, dy: 0, confidence: 0, markResults: [] };
  }

  const side = ANALYSIS_SIZE;
  const url = camera.subStreamUrl || camera.streamUrl;
  const currentGray = await captureGrayFrameMedian(url, false, 3);
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
export async function fineTune(camera: Camera, dx: number, dy: number): Promise<boolean> {
  if (dx === 0 && dy === 0) return false;
  if (!camera.hasPTZ) return false;

  const speed = Math.min(25, Math.max(5, Math.round(Math.sqrt(dx * dx + dy * dy) * 1.5)));

  if (dx > 0) {
    await controlPtz(camera, { action: 'move', direction: 'right', speed });
  } else if (dx < 0) {
    await controlPtz(camera, { action: 'move', direction: 'left', speed });
  }

  await sleep(300);

  if (dy > 0) {
    await controlPtz(camera, { action: 'move', direction: 'down', speed });
  } else if (dy < 0) {
    await controlPtz(camera, { action: 'move', direction: 'up', speed });
  }

  await sleep(300);
  await controlPtz(camera, { action: 'stop' });

  return true;
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

  const expectedCol = Math.round(mark.expectedDistanceLeft);
  const expectedRow = Math.round(mark.expectedDistanceTop);
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
    currentDistLeft: found ? bestX : mark.expectedDistanceLeft,
    currentDistTop: found ? bestY : mark.expectedDistanceTop,
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
