import { spawn } from 'node:child_process';
import { FFMPEG_PATH } from './ffmpegPath';
import { injectCredentials } from './onvifInfo';
import { isSafeStreamUrl } from './urlGuard';
import { RTSP_FALLBACK_PATHS } from './streaming';
import type { CreateCameraDTO, StreamVerifyResult } from '../../src/shared/types';

// Verificação de streams no CADASTRO: acha o HD (main) e o SD (sub) da câmera testando as
// URLs de verdade (um pacote de vídeo via FFmpeg, sem decodificar). Sempre sequencial —
// uma sessão RTSP por vez, porque câmeras XM derrubam o vídeo com 2 sessões.
const PROBE_TIMEOUT_MS = 8000;
const FALLBACK_BUDGET_MS = 45_000; // teto p/ varrer a lista de caminhos quando a URL dada falha

export type ProbeResult = {
  ok: boolean;
  width?: number;
  height?: number;
  codec?: string;
  error?: string;
};

export type VerifyInput = Pick<
  CreateCameraDTO,
  'ip' | 'port' | 'username' | 'password' | 'streamUrl' | 'subStreamUrl'
>;

// Gêmeo "sub" de uma URL de main, por marca (XM/UNV stream=0→1, Hikvision main→sub,
// Dahua subtype=0→1, Reolink _main→_sub, TP-Link stream1→2, Hanwha 101→102…).
const SUB_TWINS: Array<[RegExp, string]> = [
  [/stream=0\b/i, 'stream=1'],
  [/\/main\//i, '/sub/'],
  [/subtype=0\b/i, 'subtype=1'],
  [/_main\b/i, '_sub'],
  [/\/stream1\b/i, '/stream2'],
  [/(?<c>channels\/)101\b/i, '$<c>102'], // grupo nomeado: preserva "Channels" maiúsculo
  [/(?<c>channels\/)1\/?$/i, '$<c>2/'],
  [/\/ch0\b/i, '/ch1'],
  [/\/av0\b/i, '/av1'],
  [/\/0\/stream\b/i, '/1/stream'],
  [/\/11$/i, '/12'],
  [/\/live\/main\b/i, '/live/sub'],
];

export function twinSubUrls(mainUrl: string): string[] {
  const out: string[] = [];
  for (const [re, rep] of SUB_TWINS) {
    if (re.test(mainUrl)) out.push(mainUrl.replace(re, rep));
  }
  return out.filter((u) => u !== mainUrl);
}

// "Stream #0:0: Video: hevc (Main), yuv420p(tv), 3840x2160, 25 fps" → { codec, width, height }
export function parseVideoLine(
  stderr: string,
): { codec: string; width: number; height: number } | null {
  const m = /Video: (\w+)[^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  return m ? { codec: m[1], width: Number(m[2]), height: Number(m[3]) } : null;
}

export function maskUrl(url: string): string {
  return url
    .replace(/\/\/[^:/@]+:[^@]*@/, '//***:***@')
    .replace(/password=[^&]*/i, 'password=***');
}

// Abre o RTSP, espera UM pacote de vídeo e encerra. ok=false em timeout/erro.
export function probeRtsp(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner',
      '-rtsp_transport', 'tcp',
      '-timeout', String(timeoutMs * 1000),
      '-i', url,
      '-map', '0:v:0', '-frames:v', '1', '-c', 'copy', '-f', 'null', '-',
    ];
    const p = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    let done = false;
    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      try {
        p.kill('SIGKILL');
      } catch {
        /* noop */
      }
      resolve(r);
    };
    const guard = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs + 2000);
    p.stderr?.on('data', (c: Buffer) => {
      err += c.toString();
      if (err.length > 8192) err = err.slice(-4096);
    });
    p.on('error', (e) => finish({ ok: false, error: e.message }));
    p.on('close', (code) => {
      const v = parseVideoLine(err);
      if (code === 0 && v) finish({ ok: true, ...v });
      else {
        const last = err.trim().split('\n').pop() || `exit ${code}`;
        finish({ ok: false, error: last.slice(0, 200) });
      }
    });
  });
}

function uniq(urls: Array<string | undefined>): string[] {
  return [...new Set(urls.filter((u): u is string => !!u))];
}

export async function verifyCameraStreams(dto: VerifyInput): Promise<StreamVerifyResult> {
  const tested: string[] = [];
  const creds = (u: string) => injectCredentials(u, dto.username, dto.password);
  const origin = `rtsp://${dto.ip}:${dto.port || 554}`;
  const given = dto.streamUrl ? creds(dto.streamUrl) : undefined;

  // 1) HD: a URL informada; se falhar, os caminhos conhecidos (com teto de tempo).
  const mainCands = uniq([given, ...RTSP_FALLBACK_PATHS.map((p) => creds(origin + p))]).filter(
    isSafeStreamUrl,
  );
  let main: (ProbeResult & { url: string }) | undefined;
  const started = Date.now();
  for (const url of mainCands) {
    if (url !== given && Date.now() - started > FALLBACK_BUDGET_MS) break;
    const r = await probeRtsp(url);
    tested.push(`${maskUrl(url)} → ${r.ok ? `${r.codec} ${r.width}x${r.height}` : r.error}`);
    if (r.ok) {
      main = { ...r, url };
      break;
    }
  }
  if (!main || !main.width || !main.height) return { tested, error: 'Nenhum stream respondeu' };
  const mainUrl = main.url;
  const mainPixels = main.width * main.height;

  // 2) SD: a cadastrada e as gêmeas do HD; só vale se for MENOR que o HD (senão é o mesmo stream).
  const subCands = uniq([
    dto.subStreamUrl ? creds(dto.subStreamUrl) : undefined,
    ...twinSubUrls(mainUrl),
  ])
    .filter((u) => u !== mainUrl)
    .filter(isSafeStreamUrl);
  let sub: (ProbeResult & { url: string }) | undefined;
  for (const url of subCands) {
    const r = await probeRtsp(url);
    const smaller = r.ok && (r.width ?? 0) * (r.height ?? 0) < mainPixels;
    const detail = r.ok
      ? `${r.codec} ${r.width}x${r.height}${smaller ? '' : ' (igual ao HD, ignorado)'}`
      : r.error;
    tested.push(`${maskUrl(url)} → ${detail}`);
    if (smaller) {
      sub = { ...r, url };
      break;
    }
  }
  return {
    streamUrl: mainUrl,
    subStreamUrl: sub?.url,
    main: { width: main.width, height: main.height, codec: main.codec ?? '?' },
    sub: sub ? { width: sub.width ?? 0, height: sub.height ?? 0, codec: sub.codec ?? '?' } : undefined,
    tested,
  };
}
