// Validação das URLs de stream antes de passá-las ao FFmpeg.
// Os argumentos são passados como array (sem shell), mas uma "URL" começando com "-"
// seria interpretada como flag do FFmpeg (argument injection). Exigir um esquema de
// mídia conhecido elimina isso e ainda pega erros de digitação no cadastro.

const ALLOWED_SCHEMES = /^(rtsp|rtsps|rtmp|http|https):\/\//i;

export function isSafeStreamUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('-')) return false;
  return ALLOWED_SCHEMES.test(trimmed);
}
