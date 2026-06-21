// Utilitários de pré e pós-processamento para modelos YOLOv8 (ONNX).

export const YOLO_INPUT = 640;

export interface Detection {
  classId: number;
  score: number;
  x: number; // canto superior esquerdo (espaço 640)
  y: number;
  w: number;
  h: number;
}

// Converte um quadro RGB (HWC, uint8, 640x640x3) em tensor NCHW float32 [0..1].
export function preprocess(rgb: Buffer, size = YOLO_INPUT): Float32Array {
  const area = size * size;
  const out = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    out[i] = rgb[i * 3] / 255; // R
    out[area + i] = rgb[i * 3 + 1] / 255; // G
    out[2 * area + i] = rgb[i * 3 + 2] / 255; // B
  }
  return out;
}

// Decodifica a saída YOLOv8 [1, 4+numClasses, numAnchors].
export function decode(
  data: Float32Array,
  dims: readonly number[],
  confThreshold: number,
): Detection[] {
  const numClasses = dims[1] - 4;
  const anchors = dims[2];
  const dets: Detection[] = [];

  for (let i = 0; i < anchors; i++) {
    let bestScore = 0;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const s = data[(4 + c) * anchors + i];
      if (s > bestScore) {
        bestScore = s;
        bestClass = c;
      }
    }
    if (bestScore < confThreshold || bestClass < 0) continue;
    const cx = data[i];
    const cy = data[anchors + i];
    const w = data[2 * anchors + i];
    const h = data[3 * anchors + i];
    dets.push({ classId: bestClass, score: bestScore, x: cx - w / 2, y: cy - h / 2, w, h });
  }
  return dets;
}

function iou(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// Non-Maximum Suppression (por classe).
export function nms(dets: Detection[], iouThreshold = 0.45): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  for (const d of sorted) {
    let overlap = false;
    for (const k of keep) {
      if (k.classId === d.classId && iou(d, k) > iouThreshold) {
        overlap = true;
        break;
      }
    }
    if (!overlap) keep.push(d);
  }
  return keep;
}

// Mapeia classes COCO (modelo de objetos) para as categorias do app.
export function cocoToCategory(classId: number): 'person' | 'vehicle' | 'animal' | null {
  if (classId === 0) return 'person';
  if ([1, 2, 3, 5, 7].includes(classId)) return 'vehicle'; // bicycle, car, motorcycle, bus, truck
  if ([14, 15, 16, 17, 18, 19, 20, 21, 22, 23].includes(classId)) return 'animal';
  return null;
}
