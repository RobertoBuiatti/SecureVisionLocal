import { get } from 'node:https';
import {
  createWriteStream,
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { getDataDir } from '../paths';

export type ModelKey = 'object';

// URL padrão (baixada na 1ª ativação). Caso não esteja acessível na rede, o
// usuário pode colocar o arquivo manualmente na pasta de modelos.
const MODELS: Record<ModelKey, { file: string; url: string }> = {
  object: {
    file: 'yolov8n.onnx',
    // Fonte pública (GitHub raw) — YOLOv8n COCO, saída [1,84,8400] verificada.
    url: 'https://raw.githubusercontent.com/Hyuto/yolov8-onnxruntime-web/master/public/model/yolov8n.onnx',
  },
};

export function modelsDir(): string {
  const dir = join(getDataDir(), 'models');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Caminho do modelo na pasta do usuário (alvo de download).
export function userModelPath(key: ModelKey): string {
  return join(modelsDir(), MODELS[key].file);
}

// Caminho do modelo EMBUTIDO no app (incluído no .exe via extraResources).
export function bundledModelPath(key: ModelKey): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'models')
    : join(app.getAppPath(), 'resources', 'models');
  return join(base, MODELS[key].file);
}

function isFile(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).size > 100_000;
  } catch {
    return false;
  }
}

// Caminho efetivo para carregar: usuário > embutido. Null se nenhum existir.
export function resolveModelPath(key: ModelKey): string | null {
  if (isFile(userModelPath(key))) return userModelPath(key);
  if (isFile(bundledModelPath(key))) return bundledModelPath(key);
  return null;
}

export function isModelReady(key: ModelKey): boolean {
  return resolveModelPath(key) !== null;
}

const downloading = new Set<ModelKey>();

export function isDownloading(key?: ModelKey): boolean {
  return key ? downloading.has(key) : downloading.size > 0;
}

// Baixa o modelo (seguindo redirects). Retorna true se o arquivo ficou disponível.
export async function ensureModel(key: ModelKey): Promise<boolean> {
  if (isModelReady(key)) return true; // já existe (usuário ou embutido)
  if (downloading.has(key)) return false;
  downloading.add(key);
  try {
    await downloadFile(MODELS[key].url, userModelPath(key));
    return isModelReady(key);
  } catch {
    return false;
  } finally {
    downloading.delete(key);
  }
}

function downloadFile(url: string, dest: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('muitos redirects'));
    const req = get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        downloadFile(res.headers.location, dest, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const tmp = `${dest}.part`;
      const file = createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            // renomeia o arquivo concluído
            if (existsSync(dest)) unlinkSync(dest);
            renameSync(tmp, dest);
            resolve();
          } catch (e) {
            reject(e as Error);
          }
        });
      });
      file.on('error', (e) => {
        try {
          unlinkSync(tmp);
        } catch {
          /* noop */
        }
        reject(e);
      });
    });
    req.on('error', reject);
    req.setTimeout(120_000, () => req.destroy(new Error('timeout')));
  });
}
