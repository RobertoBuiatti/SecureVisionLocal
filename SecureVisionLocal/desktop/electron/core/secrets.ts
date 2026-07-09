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

function deriveKey(salt: Buffer): Buffer {
  const appSecret = 'SecureVisionLocal_Camera_2024!@#SecretKey';
  return pbkdf2Sync(appSecret, salt, ITERATIONS, KEY_LEN, DIGEST);
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