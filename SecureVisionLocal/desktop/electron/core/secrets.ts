import { safeStorage } from 'electron';
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT_LEN = 32;
const ITERATIONS = 100000;
const DIGEST = 'sha512';

export const PREFIX_V1 = 'enc:v1:';
const PREFIX = 'enc:v2:';

// Chaves derivadas em cache por salt. O PBKDF2 de 100k iterações custa ~50ms e é
// SÍNCRONO: como `rowToCamera` decifra 3 campos por câmera e `listCameras()` é chamado
// a cada 5s (UI), 15s (monitor), 20s (detecção) e 30s (gravação/retenção), isso bloqueava
// o processo principal por segundos a cada minuto — e main bloqueado não drena o stdout
// do FFmpeg nem envia pelo WebSocket, travando a imagem. O salt é fixo por registro, então
// a partir da 2ª leitura o custo vai a zero. O formato em disco não muda.
const keyCache = new Map<string, Buffer>();
const APP_SECRET = 'SecureVisionLocal_Camera_2024!@#SecretKey';

function deriveKey(salt: Buffer): Buffer {
  const cacheKey = salt.toString('base64');
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;
  const key = pbkdf2Sync(APP_SECRET, salt, ITERATIONS, KEY_LEN, DIGEST);
  // Teto de segurança: cada câmera usa 3 salts (senha + 2 URLs); 256 cobre ~85 câmeras.
  if (keyCache.size >= 256) keyCache.clear();
  keyCache.set(cacheKey, key);
  return key;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && (value.startsWith(PREFIX) || value.startsWith(PREFIX_V1));
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return plain ?? null;
  if (isEncrypted(plain)) return plain;
  try {
    const salt = randomBytes(SALT_LEN);
    const key = deriveKey(salt);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    return PREFIX + combined.toString('base64');
  } catch {
    return plain;
  }
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return stored ?? null;
  if (!isEncrypted(stored)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const salt = raw.subarray(0, SALT_LEN);
    const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const encrypted = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
    const key = deriveKey(salt);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    console.warn('[secrets] Falha ao descriptografar — dados corrompidos ou chave incompatível');
    return null;
  }
}

// Descriptografa um valor no formato DPAPI antigo (enc:v1:).
// Usada apenas durante a migração de formato.
export function decryptSecretLegacy(stored: string): string {
  const payload = stored.slice(PREFIX_V1.length);
  return safeStorage.decryptString(Buffer.from(payload, 'base64'));
}