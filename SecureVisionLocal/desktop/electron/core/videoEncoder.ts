import type { Camera, VideoEncoderInfo, VideoResolution } from '../../src/shared/types';
import { connectOnvif, disconnectCamera } from './ptz';

// Consulta e altera a RESOLUÇÃO do encoder de vídeo da câmera via ONVIF
// (GetVideoEncoderConfigurationOptions / SetVideoEncoderConfiguration).
// Nem toda câmera suporta — nesse caso devolvemos listas vazias e a UI esconde a opção.

/* eslint-disable @typescript-eslint/no-explicit-any */

// O XML→JSON do ONVIF varia entre firmwares: valores podem vir como objeto único ou
// array, e chaves em caixas diferentes. Estes helpers normalizam esses formatos.
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function pick(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function parseResolution(r: any): VideoResolution | null {
  const width = Number(pick(r, 'width', 'Width'));
  const height = Number(pick(r, 'height', 'Height'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function configToken(config: any): string | undefined {
  return config?.$?.token ?? config?.token;
}

function getConfigurations(cam: any): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      cam.getVideoEncoderConfigurations((err: unknown, configs: unknown) => {
        resolve(err ? [] : asArray(configs as any));
      });
    } catch {
      resolve([]);
    }
  });
}

function getOptions(cam: any, token: string | undefined): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      const opts = token ? { configurationToken: token } : {};
      cam.getVideoEncoderConfigurationOptions(opts, (err: unknown, options: unknown) => {
        resolve(err ? null : options);
      });
    } catch {
      resolve(null);
    }
  });
}

// Extrai todas as resoluções anunciadas nas opções (H264/H265/JPEG/MPEG4), sem duplicar.
function extractResolutions(options: any): VideoResolution[] {
  const found = new Map<string, VideoResolution>();
  const groups = [
    pick(options, 'H264', 'h264'),
    pick(options, 'H265', 'h265'),
    pick(options, 'JPEG', 'jpeg'),
    pick(options, 'MPEG4', 'mpeg4'),
    options, // algumas câmeras põem resolutionsAvailable na raiz
  ];
  for (const group of groups) {
    const list = asArray(pick(group, 'resolutionsAvailable', 'ResolutionsAvailable'));
    for (const raw of list) {
      const res = parseResolution(raw);
      if (res) found.set(`${res.width}x${res.height}`, res);
    }
  }
  return Array.from(found.values()).sort((a, b) => b.width * b.height - a.width * a.height);
}

// Lista a resolução atual e as disponíveis do stream PRINCIPAL da câmera.
export async function getVideoEncoderInfo(camera: Camera): Promise<VideoEncoderInfo> {
  const empty: VideoEncoderInfo = { supported: false, current: null, resolutions: [] };
  try {
    const cam = (await connectOnvif(camera)) as any;
    const configs = await getConfigurations(cam);
    if (!configs.length) return empty;
    const main = configs[0];
    const current = parseResolution(pick(main, 'resolution', 'Resolution'));
    const options = await getOptions(cam, configToken(main));
    const resolutions = options ? extractResolutions(options) : [];
    return { supported: resolutions.length > 0, current, resolutions };
  } catch {
    return empty;
  }
}

// Aplica a resolução escolhida no encoder principal. A câmera normalmente reinicia o
// stream RTSP ao aplicar — o watchdog do streaming reconecta sozinho.
export async function setVideoResolution(
  camera: Camera,
  resolution: VideoResolution,
): Promise<boolean> {
  const width = Math.round(Number(resolution?.width));
  const height = Math.round(Number(resolution?.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  try {
    const cam = (await connectOnvif(camera)) as any;
    const configs = await getConfigurations(cam);
    if (!configs.length) return false;
    const main = configs[0];

    // Confirma que a resolução pedida está entre as anunciadas pela câmera.
    const options = await getOptions(cam, configToken(main));
    const available = options ? extractResolutions(options) : [];
    if (available.length && !available.some((r) => r.width === width && r.height === height)) {
      return false;
    }

    const updated = { ...main, resolution: { width, height } };
    const ok = await new Promise<boolean>((resolve) => {
      try {
        cam.setVideoEncoderConfiguration(updated, (err: unknown) => resolve(!err));
      } catch {
        resolve(false);
      }
    });
    // A sessão ONVIF pode ficar instável após reconfigurar o encoder — renova no próximo uso.
    if (ok) disconnectCamera(camera.id);
    return ok;
  } catch {
    return false;
  }
}
