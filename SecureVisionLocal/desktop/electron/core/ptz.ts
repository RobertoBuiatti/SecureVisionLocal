import type { Camera, PTZCommand, PTZDirection } from '../../src/shared/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as onvifNs from 'onvif';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onvif: any = (onvifNs as any).default ?? onvifNs;

// Cache de conexões ONVIF por câmera (a conexão é reutilizada entre comandos).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const camConnections = new Map<string, any>();

function connect(camera: Camera): Promise<unknown> {
  const cached = camConnections.get(camera.id);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line no-new
      const cam = new onvif.Cam(
        {
          hostname: camera.ip,
          username: camera.username,
          password: camera.password,
          // Usa a porta ONVIF detectada (ex.: 8899 em Xiongmai); senão tenta 80.
          port: camera.onvifPort ?? (camera.port === 554 ? 80 : camera.port),
        },
        (err: unknown) => {
          if (err) {
            reject(err);
            return;
          }
          camConnections.set(camera.id, cam);
          resolve(cam);
        },
      );
    } catch (err) {
      reject(err);
    }
  });
}

// Converte a direção em vetor de velocidades (x = pan, y = tilt).
function directionToVector(direction: PTZDirection, speed: number): { x: number; y: number } {
  const s = Math.max(0, Math.min(1, speed / 100));
  const map: Record<PTZDirection, { x: number; y: number }> = {
    up: { x: 0, y: s },
    down: { x: 0, y: -s },
    left: { x: -s, y: 0 },
    right: { x: s, y: 0 },
    'up-left': { x: -s, y: s },
    'up-right': { x: s, y: s },
    'down-left': { x: -s, y: -s },
    'down-right': { x: s, y: -s },
  };
  return map[direction];
}

// Lê os presets da câmera como um mapa { nomeOuToken: token }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPresetsMap(cam: any): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      cam.getPresets((err: unknown, presets: unknown) => {
        resolve(err ? {} : (presets as Record<string, unknown>) ?? {});
      });
    } catch {
      resolve({});
    }
  });
}

// Salva a posição atual como preset ONVIF e retorna o TOKEN real (lido via getPresets).
// O retorno do setPreset varia muito entre câmeras; ler os presets pelo nome é confiável.
export async function savePresetOnvif(camera: Camera, name: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (await connect(camera)) as any;
    await new Promise<void>((resolve) => {
      try {
        cam.setPreset({ presetName: name }, () => resolve());
      } catch {
        resolve();
      }
    });
    const presets = await getPresetsMap(cam);
    const token = presets[name];
    if (token === undefined || token === null) return null;
    return String(token);
  } catch {
    return null;
  }
}

// Regrava um preset existente na posição ATUAL da câmera (autocorreção).
export async function updatePresetOnvif(camera: Camera, token: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (await connect(camera)) as any;
    return await new Promise<boolean>((resolve) => {
      cam.setPreset({ presetToken: token }, (err: unknown) => resolve(!err));
    });
  } catch {
    return false;
  }
}

// Move a câmera para um preset salvo.
export async function gotoPresetOnvif(camera: Camera, token: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (await connect(camera)) as any;
    return await new Promise<boolean>((resolve) => {
      cam.gotoPreset({ preset: token }, (err: unknown) => resolve(!err));
    });
  } catch {
    return false;
  }
}

// Movimento contínuo por vetor (x=pan, y=tilt, -1..1) — usado no rastreio de objetos.
export async function continuousMoveVector(
  camera: Camera,
  x: number,
  y: number,
  zoom = 0,
): Promise<boolean> {
  if (!camera.hasPTZ) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (await connect(camera)) as any;
    cam.continuousMove({ x, y, zoom });
    return true;
  } catch {
    return false;
  }
}

export async function controlPtz(camera: Camera, cmd: PTZCommand): Promise<boolean> {
  if (!camera.hasPTZ) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (await connect(camera)) as any;
    const speed = cmd.speed ?? 50;

    switch (cmd.action) {
      case 'move': {
        if (!cmd.direction) return false;
        const v = directionToVector(cmd.direction, speed);
        cam.continuousMove({ x: v.x, y: v.y, zoom: 0 });
        return true;
      }
      case 'zoom-in':
        cam.continuousMove({ x: 0, y: 0, zoom: speed / 100 });
        return true;
      case 'zoom-out':
        cam.continuousMove({ x: 0, y: 0, zoom: -speed / 100 });
        return true;
      case 'stop':
        cam.stop({ panTilt: true, zoom: true });
        return true;
      case 'goto-preset':
        if (!cmd.presetToken) return false;
        cam.gotoPreset({ preset: cmd.presetToken });
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
