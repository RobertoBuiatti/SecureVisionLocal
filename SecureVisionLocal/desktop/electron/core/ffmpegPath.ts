import ffmpegStatic from 'ffmpeg-static';

// Caminho único do binário FFmpeg, usado por todos os módulos que fazem spawn.
// Em produção (empacotado), o ffmpeg-static aponta para dentro de app.asar, mas o
// binário é extraído para app.asar.unpacked (ver asarUnpack no electron-builder.yml).
// Sem esta troca, o spawn falha com ENOENT e a câmera nunca conecta no .exe.
// Em dev o caminho não contém "app.asar", então o replace é um no-op seguro.
const raw = (ffmpegStatic as unknown as string) || 'ffmpeg';
export const FFMPEG_PATH: string = raw.replace('app.asar', 'app.asar.unpacked');
