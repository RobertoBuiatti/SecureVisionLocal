import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import type { Camera } from '../../src/shared/types';
import { getThumbnailsDir } from './paths';

const FFMPEG_PATH: string = (ffmpegStatic as unknown as string) || 'ffmpeg';
const GRID = 64; // resolução da comparação (64x64 cinza)

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

// Diferença média de pixels (0-255) entre dois quadros cinza. Quanto menor, mais
// parecidos (a câmera está na mesma posição).
export function meanDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 255;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

function run(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    ff.on('error', () => resolve(false));
    ff.on('close', (code) => resolve(code === 0));
  });
}
