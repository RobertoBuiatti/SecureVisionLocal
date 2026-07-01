import { safeStorage } from 'electron';

// Criptografia de segredos em repouso (senhas de câmera e URLs com credenciais).
// Usa o safeStorage do Electron (DPAPI no Windows): a chave fica atrelada ao usuário
// do sistema operacional, então o .db sozinho não expõe as senhas.
// Formato armazenado: "enc:v1:<base64>". Valores sem o prefixo são tratados como
// texto puro legado (e migrados na inicialização).

const PREFIX = 'enc:v1:';

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return plain ?? null;
  if (isEncrypted(plain)) return plain; // já cifrado
  try {
    if (!safeStorage.isEncryptionAvailable()) return plain; // sem DPAPI → mantém como está
    return PREFIX + safeStorage.encryptString(plain).toString('base64');
  } catch {
    return plain;
  }
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return stored ?? null;
  if (!isEncrypted(stored)) return stored; // legado em texto puro
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'));
  } catch {
    // Chave de outro usuário/máquina: melhor devolver vazio do que o blob cifrado.
    return null;
  }
}
