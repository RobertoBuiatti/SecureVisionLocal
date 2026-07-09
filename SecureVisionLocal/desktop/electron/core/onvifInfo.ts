// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as onvifNs from 'onvif';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onvif: any = (onvifNs as any).default ?? onvifNs;

// Portas ONVIF mais comuns (o serviço ONVIF normalmente NÃO é a porta 554 do RTSP).
const ONVIF_PORTS = [80, 8000, 2020, 8080, 8899];

export interface OnvifDeviceInfo {
  manufacturer?: string;
  model?: string;
  firmware?: string;
  hasPTZ: boolean;
  streamUri?: string; // URL RTSP real (mainstream), com o caminho correto
  subStreamUri?: string; // substream, se houver
  onvifPort?: number;
}

// Tenta conectar via ONVIF numa porta específica.
function tryConnect(
  ip: string,
  port: number,
  username: string,
  password: string,
): Promise<unknown | null> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line no-new
      const cam = new onvif.Cam(
        { hostname: ip, port, username, password, timeout: 5000 },
        (err: unknown) => resolve(err ? null : cam),
      );
    } catch {
      resolve(null);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profileToken(p: any): string | undefined {
  return p?.$?.token ?? p?.token ?? p?.['$']?.token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStreamUri(cam: any, token?: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      cam.getStreamUri(
        { protocol: 'RTSP', profileToken: token },
        (err: unknown, stream: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resolve(err ? null : (stream as any)?.uri ?? null);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDeviceInfo(cam: any): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    try {
      cam.getDeviceInformation((err: unknown, info: unknown) => {
        resolve(err ? {} : (info as Record<string, string>) ?? {});
      });
    } catch {
      resolve({});
    }
  });
}

// Consulta a câmera via ONVIF (com credenciais) e retorna dados + URL de stream real.
export async function probeOnvifDevice(
  ip: string,
  username: string,
  password: string,
): Promise<OnvifDeviceInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cam: any = null;
  let usedPort: number | undefined;
  for (const port of ONVIF_PORTS) {
    // eslint-disable-next-line no-await-in-loop
    cam = await tryConnect(ip, port, username, password);
    if (cam) {
      usedPort = port;
      break;
    }
  }
  if (!cam) return null;

  const info = await getDeviceInfo(cam);
  const profiles: unknown[] = Array.isArray(cam.profiles) ? cam.profiles : [];
  const mainToken = profileToken(profiles[0]);
  const subToken = profiles[1] ? profileToken(profiles[1]) : undefined;

  // Algumas câmeras (ex.: Xiongmai) retornam o host errado no stream URI.
  // Reescrevemos o host para o IP em que de fato conectamos.
  const rewriteHost = (uri: string | null): string | undefined =>
    uri ? uri.replace(/^(rtsp:\/\/)([^/:@]+)/i, `$1${ip}`) : undefined;

  const streamUri = rewriteHost(await getStreamUri(cam, mainToken));
  const subStreamUri = subToken ? rewriteHost(await getStreamUri(cam, subToken)) : undefined;

  // PTZ é indicado pela presença de PTZConfiguration no perfil (capabilities.PTZ
  // costuma vir vazio em câmeras Xiongmai mesmo quando há PTZ).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasPTZ = !!(
    cam.capabilities?.PTZ ||
    cam.services?.PTZ ||
    cam.defaultProfile?.PTZConfiguration ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profiles.some((p: any) => p && p.PTZConfiguration)
  );

  return {
    manufacturer: info.manufacturer,
    model: info.model,
    firmware: info.firmwareVersion,
    hasPTZ,
    streamUri,
    subStreamUri,
    onvifPort: usedPort,
  };
}

// Injeta usuário:senha numa URL RTSP que ainda não os tenha.
export function injectCredentials(url: string, username?: string, password?: string): string {
  if (!url) return url;
  if (url.includes('@')) return url; // já tem credenciais no formato user:pass@
  if (/[?&]password=|\/user=/i.test(url)) return url; // estilo Xiongmai (credenciais no caminho)
  if (!username) return url; // sem usuário, mantém URL original
  return url.replace(/^rtsp:\/\//i, `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password ?? '')}@`);
}
