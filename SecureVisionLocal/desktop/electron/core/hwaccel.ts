import { getSettings } from './settings';

// Argumentos de DECODIFICAÇÃO acelerada por hardware para o FFmpeg, conforme a
// configuração do usuário. Devem vir ANTES do "-i". Usados só nos pipelines que
// reencodam (live MPEG1, HLS, reprodução de arquivo) — gravação usa "-c copy"
// (sem decode), então lá não há o que acelerar.
//   auto  → "-hwaccel auto" (o FFmpeg escolhe e cai para software sozinho)
//   nvenc → decodificação NVDEC/CUDA (escolha explícita do usuário)
//   qsv   → Intel Quick Sync
//   none  → decodificação por software
export function hwaccelArgs(): string[] {
  switch (getSettings().hardwareAcceleration) {
    case 'auto':
      return ['-hwaccel', 'auto'];
    case 'nvenc':
      return ['-hwaccel', 'cuda'];
    case 'qsv':
      return ['-hwaccel', 'qsv'];
    default:
      return [];
  }
}
