import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { FFMPEG_PATH } from '../ffmpegPath';
import { ensureModel, resolveModelPath } from './modelManager';
import { preprocess as yoloPreprocess, YOLO_INPUT } from './yolo';
import { presetsSnapshotDir } from '../snapshotService';
import { freshLiveFrame } from '../liveFrameCache';

const nodeRequire = createRequire(__filename);
let ortLib: any = null;
let ortTried = false;
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

const FRAME_BYTES = YOLO_INPUT * YOLO_INPUT * 3;

// Conexão única ESTRITA: usa SOMENTE o liveFrame compartilhado (arquivo JPEG da puxada).
// Sem quadro fresco → null; NÃO abre sessão RTSP própria (evita concorrência na câmera).
function captureRgbFrame(cameraId: string | null): Promise<Buffer | null> {
  const live = cameraId ? freshLiveFrame(cameraId) : null;
  if (!live) return Promise.resolve(null);
  const vf = `scale=${YOLO_INPUT}:${YOLO_INPUT},format=rgb24`;
  const args = ['-i', live, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', 'pipe:1'];
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const ff = spawn(FFMPEG_PATH, args);
    ff.on('error', () => resolve(null));
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.on('close', () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.length >= FRAME_BYTES ? buf.subarray(0, FRAME_BYTES) : null);
    });
  });
}

export async function computeEmbedding(rgb: Buffer): Promise<Float32Array | null> {
  const runtime = ort();
  if (!runtime) return null;

  const ok = await ensureModel('object');
  if (!ok) return null;
  const modelPath = resolveModelPath('object');
  if (!modelPath) return null;

  let session;
  try {
    session = await runtime.InferenceSession.create(modelPath);
  } catch {
    return null;
  }

  const input = yoloPreprocess(rgb);
  const tensor = new runtime.Tensor('float32', input, [1, 3, YOLO_INPUT, YOLO_INPUT]);

  try {
    const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
    const result = await session.run(feeds);
    const output = result[session.outputNames[0]];
    const data = output.data as Float32Array;

    const anchors = 8400;
    const numClasses = 80;
    const embedding = new Float32Array(anchors);

    for (let i = 0; i < anchors; i++) {
      let maxP = 0;
      for (let c = 0; c < numClasses; c++) {
        const p = data[(4 + c) * anchors + i];
        if (p > maxP) maxP = p;
      }
      embedding[i] = maxP;
    }

    return embedding;
  } catch {
    return null;
  }
}

export function embeddingSimilarity(a: Float32Array, b: Float32Array, minEnergy = 0.01): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  na = Math.sqrt(na);
  nb = Math.sqrt(nb);
  if (na < minEnergy || nb < minEnergy) return 0;
  const denom = na * nb;
  return denom === 0 ? 0 : dot / denom;
}

export function saveEmbedding(presetId: string, embedding: Float32Array): void {
  const path = join(presetsSnapshotDir(), `${presetId}.emb`);
  writeFileSync(path, Buffer.from(embedding.buffer));
}

export function loadEmbedding(presetId: string): Float32Array | null {
  try {
    const path = join(presetsSnapshotDir(), `${presetId}.emb`);
    const buf = readFileSync(path);
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } catch {
    return null;
  }
}

export async function computeAndSaveReferenceEmbedding(
  cameraId: string | null,
  url: string,
  presetId: string,
): Promise<boolean> {
  if (!ort()) return false;
  const rgb = await captureRgbFrame(cameraId);
  if (!rgb) return false;
  const emb = await computeEmbedding(rgb);
  if (!emb) return false;
  saveEmbedding(presetId, emb);
  return true;
}

export async function aiVerifyPosition(
  cameraId: string | null,
  url: string,
  presetId: string,
): Promise<number | null> {
  if (!ort()) return null;
  const ref = loadEmbedding(presetId);
  if (!ref) return null;
  const rgb = await captureRgbFrame(cameraId);
  if (!rgb) return null;
  const cur = await computeEmbedding(rgb);
  if (!cur) return null;
  return embeddingSimilarity(cur, ref);
}
