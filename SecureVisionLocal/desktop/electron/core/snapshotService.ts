import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { FFMPEG_PATH } from './ffmpegPath';
import { insertCameraLog } from './cameraLogger';
import type { Camera } from '../../src/shared/types';
import { getThumbnailsDir } from './paths';
import { injectCredentials } from './onvifInfo';

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
// Tenta até 3 vezes com intervalo de 500ms entre tentativas, porque a
// câmera pode estar momentaneamente ocupada (ex.: após salvar um preset).
export async function captureJpeg(camera: Camera, outPath: string, preferHighQuality = false): Promise<boolean> {
  const primaryUrl = preferHighQuality ? camera.streamUrl : camera.subStreamUrl;
  const fallbackUrl = preferHighQuality ? camera.subStreamUrl : camera.streamUrl;
  const rawUrls = [primaryUrl, fallbackUrl].filter(Boolean) as string[];
  const urls = rawUrls.map((u) => injectCredentials(u, camera.username, camera.password));
  
  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const url = urls[urlIndex];
    // Na URL principal tenta 1x; na fallback tenta 3x
    const maxAttempts = urlIndex === 0 ? 1 : 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ok = await snapOne(url, outPath);
      if (ok) {
        let fileSize = 0;
        try { fileSize = statSync(outPath).size; } catch { /* noop */ }
        insertCameraLog(
          camera.id,
          camera.name,
          'info',
          `Snapshot de "${camera.name}" capturado (${Math.round(fileSize / 1024)}KB)`,
          `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nArquivo: ${outPath}\nTamanho: ${Math.round(fileSize / 1024)}KB\nURL: ${url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nTentativa: ${attempt + 1}/${maxAttempts}`,
          'snapshot',
        );
        return true;
      }
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 500));
    }
  }
  insertCameraLog(
    camera.id,
    camera.name,
    'error',
    `Falha ao capturar snapshot de "${camera.name}" após múltiplas tentativas`,
    `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nUsuário: ${camera.username || '—'}\nURL principal: ${(camera.streamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nURL secundária: ${(camera.subStreamUrl || '—').replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\nCaminho de saída: ${outPath}\n\nTentou main stream 1x, sub-stream 3x. O FFmpeg retornou código de erro em todas. Verifique se a câmera está acessível e a URL de stream está correta.`,
    'snapshot',
  );
  return false;
}

function snapOne(url: string, outPath: string): Promise<boolean> {
  const args = [
    '-rtsp_transport', 'tcp',
    '-stimeout', '3000000',
    '-i', url,
    '-frames:v', '1',
    '-q:v', '3',
    '-y', outPath,
  ];
  return run(args);
}

function run(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    ff.on('error', () => resolve(false));
    ff.on('close', (code) => resolve(code === 0));
  });
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

// ZNCC entre duas janelas sobrepostas dos quadros (usada pela estimativa de
// deslocamento). Percorre com passo 2 para reduzir custo sem perder robustez.
function overlapZncc(
  cur: Buffer,
  ref: Buffer,
  side: number,
  dx: number,
  dy: number,
): number | null {
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(side, side + dx);
  const y1 = Math.min(side, side + dy);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < side / 3 || h < side / 3) return null; // sobreposição pequena demais → não confiável

  let ma = 0;
  let mb = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      ma += cur[y * side + x];
      mb += ref[(y - dy) * side + (x - dx)];
      n++;
    }
  }
  if (n === 0) return null;
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const xa = cur[y * side + x] - ma;
      const xb = ref[(y - dy) * side + (x - dx)] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export interface ShiftEstimate {
  dx: number; // deslocamento horizontal (px na grade de análise); >0 = referência à direita no quadro atual
  dy: number; // deslocamento vertical; >0 = referência mais abaixo no quadro atual
  confidence: number; // ZNCC no melhor alinhamento (0..1); baixo = estimativa duvidosa
}

// Estima o DESLOCAMENTO (dx, dy) entre o quadro atual e a referência do preset por
// busca de correlação (template matching): testa alinhamentos grossos (passo 4) numa
// janela de ±40% da imagem e refina o melhor com passo 1. Isto dá à autocorreção a
// DIREÇÃO e a ORDEM de grandeza do desvio de uma só vez, em vez de descobrir por
// tentativa e erro movendo a câmera em todas as direções.
export function estimateShift(cur: Buffer, ref: Buffer, side = ANALYSIS_SIZE): ShiftEstimate | null {
  const range = Math.round(side * 0.4);
  let best = { dx: 0, dy: 0, score: -2 };

  for (let dy = -range; dy <= range; dy += 4) {
    for (let dx = -range; dx <= range; dx += 4) {
      const s = overlapZncc(cur, ref, side, dx, dy);
      if (s !== null && s > best.score) best = { dx, dy, score: s };
    }
  }
  if (best.score <= -2) return null;

  // Refinamento fino (passo 1) ao redor do melhor alinhamento grosso.
  const coarse = { ...best };
  for (let dy = coarse.dy - 3; dy <= coarse.dy + 3; dy++) {
    for (let dx = coarse.dx - 3; dx <= coarse.dx + 3; dx++) {
      if (dx === coarse.dx && dy === coarse.dy) continue;
      const s = overlapZncc(cur, ref, side, dx, dy);
      if (s !== null && s > best.score) best = { dx, dy, score: s };
    }
  }

  return { dx: best.dx, dy: best.dy, confidence: Math.max(0, best.score) };
}
