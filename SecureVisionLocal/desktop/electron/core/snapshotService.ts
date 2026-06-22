import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { FFMPEG_PATH } from './ffmpegPath';
import type { Camera } from '../../src/shared/types';
import { getThumbnailsDir } from './paths';

// Resolução (quadrado, cinza) em que os quadros são analisados. Maior que o necessário
// para a comparação da imagem inteira, de propósito: dá detalhe suficiente para os
// recortes centrais menores usados no ajuste fino de posição (autocorreção multi-escala).
export const ANALYSIS_SIZE = 128;
const GRID = ANALYSIS_SIZE;

export function presetsSnapshotDir(): string {
  const dir = join(getThumbnailsDir(), 'presets');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Captura um único quadro JPEG da câmera para o caminho indicado.
export function captureJpeg(camera: Camera, outPath: string): Promise<boolean> {
  const url = camera.subStreamUrl || camera.streamUrl;
  const args = [
    '-rtsp_transport', 'tcp',
    '-i', url,
    '-frames:v', '1',
    '-q:v', '3',
    '-y', outPath,
  ];
  return run(args);
}

// Captura um quadro cinza GRIDxGRID (cru) de um RTSP ou de um arquivo, em memória.
export function captureGrayFrame(input: string, isFile: boolean): Promise<Buffer | null> {
  const args = [
    ...(isFile ? [] : ['-rtsp_transport', 'tcp']),
    '-i', input,
    '-frames:v', '1',
    '-vf', `scale=${GRID}:${GRID},format=gray`,
    '-f', 'rawvideo',
    'pipe:1',
  ];
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const ff = spawn(FFMPEG_PATH, args);
    ff.on('error', () => resolve(null));
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.on('close', () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.length >= GRID * GRID ? buf.subarray(0, GRID * GRID) : null);
    });
  });
}

// Captura VÁRIAS amostras ao vivo e devolve a MEDIANA por pixel. A mediana descarta
// objetos passageiros (pessoas, folhas balançando, faróis) e flutuações de exposição,
// dando uma medida de posição muito mais estável que um único quadro — essencial para
// a autocorreção não "perseguir" ruído. Para arquivo (referência) basta uma leitura.
export async function captureGrayFrameMedian(
  input: string,
  isFile: boolean,
  samples = 3,
): Promise<Buffer | null> {
  if (isFile) return captureGrayFrame(input, true);

  const frames: Buffer[] = [];
  for (let i = 0; i < samples; i++) {
    // eslint-disable-next-line no-await-in-loop
    const f = await captureGrayFrame(input, false);
    if (f) frames.push(f);
  }
  if (!frames.length) return null;
  if (frames.length === 1) return frames[0];

  const out = Buffer.alloc(GRID * GRID);
  const mid = Math.floor(frames.length / 2);
  const vals: number[] = new Array(frames.length);
  for (let p = 0; p < GRID * GRID; p++) {
    for (let k = 0; k < frames.length; k++) vals[k] = frames[k][p];
    vals.sort((a, b) => a - b);
    out[p] = vals[mid]; // mediana (amostra central)
  }
  return out;
}

// Recorte central de um quadro quadrado (lado `side`), pegando a fração `f` (0..1) do
// centro. Ex.: f=0.5 devolve o quarto central. Usado na autocorreção multi-escala: a
// imagem inteira posiciona grosso, recortes menores afinam (mais sensíveis a desvio).
export function centerCrop(buf: Buffer, side: number, f: number): Buffer {
  const c = Math.max(8, Math.min(side, Math.round(side * f)));
  if (c === side) return buf;
  const off = Math.floor((side - c) / 2);
  const out = Buffer.alloc(c * c);
  for (let y = 0; y < c; y++) {
    const src = (off + y) * side + off;
    buf.copy(out, y * c, src, src + c);
  }
  return out;
}

// Distância visual (ZNCC) considerando só o recorte central de fração `f` dos quadros.
export function frameDistanceCrop(a: Buffer, b: Buffer, side: number, f: number): number {
  return frameDistance(centerCrop(a, side, f), centerCrop(b, side, f));
}

// Diferença média de pixels (0-255) entre dois quadros cinza. Quanto menor, mais
// parecidos (a câmera está na mesma posição).
export function meanDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 255;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

// Distância visual entre dois quadros cinza, ROBUSTA a mudanças de brilho/contraste
// (correlação cruzada normalizada — ZNCC). Retorna 0..100 onde MENOR = mais parecido
// (0 = mesma cena). Diferente do meanDiff, não é enganada por auto-exposição/ganho da
// câmera, o que torna a verificação/recuperação de posição muito mais confiável.
export function frameDistance(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 100;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return 100; // quadro plano (sem textura) → indefinido
  const zncc = num / Math.sqrt(da * db); // -1 (oposto) .. 1 (idêntico)
  return (1 - zncc) * 50; // 0 (idêntico) .. 100 (oposto)
}

function run(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    ff.on('error', () => resolve(false));
    ff.on('close', (code) => resolve(code === 0));
  });
}
