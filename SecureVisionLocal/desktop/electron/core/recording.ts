import { spawn, type ChildProcess } from 'node:child_process';
import { statSync, unlink } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FFMPEG_PATH } from './ffmpegPath';
import { isSafeStreamUrl } from './urlGuard';
import { insertCameraLog } from './cameraLogger';
import type { Camera, DetectionType, Recording } from '../../src/shared/types';
import { getSettings } from './settings';
import { insertRecording, finalizeRecording } from './recordingRepository';
import { overlayDetections } from './markRecording';
import { injectCredentials } from './onvifInfo';

interface ActiveRecording {
  recording: Recording;
  ffmpeg: ChildProcess | null; // null quando o clipe vem da puxada única
  tsPath?: string; // arquivo MPEG-TS intermediário do clipe derivado da puxada única
}

// Fonte de clipe derivada da puxada única do StreamingService. Injetada no main para não
// criar dependência circular (streaming → motionDetection → recording → streaming).
export interface ClipSource {
  isActive: (cameraId: string) => boolean;
  start: (cameraId: string, tsPath: string) => boolean;
  stop: (cameraId: string, onClosed?: () => void) => void;
}

function timestampName(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}.mp4`;
}

// Sufixo do nome de arquivo conforme o gatilho — o clipe exportado já "diz" o que é.
const DETECTION_FILE_LABEL: Record<DetectionType, string> = {
  motion: 'movimento',
  person: 'pessoa',
  vehicle: 'veiculo',
  animal: 'animal',
};

// Gerencia gravações em disco local. Usa `-c copy` (sem reencode) para baixo uso de CPU.
export class RecordingService {
  private active = new Map<string, ActiveRecording>();
  private clipSource?: ClipSource;

  // Ver `ClipSource`. Sem isto, o serviço mantém o comportamento antigo (sessão RTSP nova).
  setClipSource(source: ClipSource): void {
    this.clipSource = source;
  }

  isRecording(cameraId: string): boolean {
    return this.active.has(cameraId);
  }

  start(
    camera: Camera,
    type: Recording['type'] = 'manual',
    detectionType?: DetectionType,
  ): Recording {
    const existing = this.active.get(camera.id);
    if (existing) return existing.recording;
    if (!isSafeStreamUrl(camera.streamUrl)) {
      throw new Error('URL de stream inválida — edite a câmera.');
    }

    const { recordingsPath } = getSettings();
    const label = detectionType ? `_${DETECTION_FILE_LABEL[detectionType]}` : '';
    const filename = timestampName(`${camera.name.replace(/[^\w-]/g, '_')}${label}`);
    const filePath = join(recordingsPath, filename);

    const recording: Recording = {
      id: `rec_${randomUUID().slice(0, 8)}`,
      cameraId: camera.id,
      cameraName: camera.name,
      type,
      detectionType,
      status: 'recording',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      fileSize: 0,
      filePath,
      hasMotion: detectionType === 'motion',
    };

    // CAMINHO PREFERIDO: derivar o clipe da puxada única já aberta. Zero conexão nova na
    // câmera. Só cai para o RTSP direto quando não há puxada ativa para esta câmera.
    if (this.clipSource?.isActive(camera.id)) {
      const tsPath = filePath.replace(/\.mp4$/, '.ts');
      if (this.clipSource.start(camera.id, tsPath)) {
        insertRecording(recording);
        this.active.set(camera.id, { recording, ffmpeg: null, tsPath });
        insertCameraLog(
          camera.id,
          camera.name,
          'info',
          `Gravação por detecção de "${camera.name}" iniciada (${detectionType || 'manual'})`,
          `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nTipo: ${detectionType || 'manual'}\nArquivo: ${filePath}\n\nO clipe está sendo derivado da puxada única já aberta (mesma imagem do vídeo ao vivo), SEM abrir uma segunda sessão RTSP na câmera. Se a gravação 24/7 estiver ligada, o vídeo em qualidade original do mesmo instante também continua nos segmentos contínuos.`,
          'recording',
        );
        return recording;
      }
    }

    const streamUrl = injectCredentials(camera.streamUrl, camera.username, camera.password);
    const args = [
      '-rtsp_transport', 'tcp',
      '-timeout', '10000000', // 10s: sem isto o processo podia ficar pendurado na câmera
      '-i', streamUrl,
      // Mapeamento explícito com áudio OPCIONAL ("0:a?"): câmeras sem faixa de áudio
      // não derrubam mais o FFmpeg — ele grava só o vídeo.
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'copy', // copia o vídeo (sem reencode) — baixo uso de CPU
      '-c:a', 'aac', // converte o áudio (ex.: pcm_alaw da Xiongmai) p/ AAC compatível com MP4
      '-movflags', '+frag_keyframe+empty_moov',
      '-f', 'mp4',
      '-y', filePath,
    ];

    // stdin habilitado para enviar 'q' e finalizar o arquivo de forma limpa.
    const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['pipe', 'ignore', 'ignore'] });

    ffmpeg.on('error', () => {
      this.handleClosed(camera.id);
    });
    ffmpeg.on('close', () => {
      this.handleClosed(camera.id);
    });

    insertRecording(recording);
    this.active.set(camera.id, { recording, ffmpeg });
    insertCameraLog(
      camera.id,
      camera.name,
      'info',
      `Gravação por detecção de "${camera.name}" iniciada (${detectionType || 'manual'})`,
      `Câmera: ${camera.name}\nIP: ${camera.ip}:${camera.port}\nTipo: ${detectionType || 'manual'}\nArquivo: ${filePath}\n\nA gravação por evento foi iniciada. O vídeo está sendo salvo sem reencode (cópia direta) para mínimo uso de CPU.`,
      'recording',
    );
    return recording;
  }

  stop(cameraId: string): void {
    const item = this.active.get(cameraId);
    if (!item) return;
    const camName = item.recording.cameraName || cameraId;
    insertCameraLog(
      cameraId,
      camName,
      'info',
      `Gravação por detecção de "${camName}" finalizando (${item.recording.detectionType || 'manual'})`,
      `Câmera: ${camName}\nArquivo: ${item.recording.filePath}\nDuração até o momento: ${Math.round((Date.now() - item.recording.startTime) / 1000)}s\n\nEnviando comando de parada para o FFmpeg. O arquivo será finalizado com trailer MP4 correto.`,
      'recording',
    );
    // Clipe derivado da puxada única: fecha o MPEG-TS e remuxa para MP4 (arquivo local,
    // `-c copy`, sem reencode e sem tocar na câmera).
    if (!item.ffmpeg) {
      this.clipSource?.stop(cameraId, () => this.remuxClip(cameraId));
      return;
    }

    try {
      // 'q' faz o FFmpeg encerrar gravando o trailer do MP4 corretamente.
      item.ffmpeg.stdin?.write('q');
    } catch {
      try {
        item.ffmpeg.kill('SIGINT');
      } catch {
        /* noop */
      }
    }
  }

  // Converte o MPEG-TS do clipe em MP4 reproduzível. Só remuxa (sem reencode).
  private remuxClip(cameraId: string): void {
    const item = this.active.get(cameraId);
    if (!item?.tsPath) {
      this.handleClosed(cameraId);
      return;
    }
    const { tsPath } = item;
    const args = [
      '-i', tsPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', item.recording.filePath,
    ];
    const ff = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    let done = false; // 'error' e 'close' podem disparar os dois para o mesmo processo
    const finish = (): void => {
      if (done) return;
      done = true;
      unlink(tsPath, () => {
        /* o .ts intermediário não interessa depois do remux */
      });
      this.handleClosed(cameraId);
    };
    ff.on('error', finish);
    ff.on('close', finish);
  }

  stopAll(): void {
    for (const id of Array.from(this.active.keys())) this.stop(id);
  }

  private handleClosed(cameraId: string): void {
    const item = this.active.get(cameraId);
    if (!item) return;
    this.active.delete(cameraId);
    const recName2 = item.recording.cameraName || cameraId;
    insertCameraLog(
      cameraId,
      recName2,
      'info',
      `Gravação por detecção de "${recName2}" encerrada`,
      `Câmera: ${recName2}\nArquivo: ${item.recording.filePath}\nDuração: ${Math.round((Date.now() - item.recording.startTime) / 1000)}s\n\nO processo FFmpeg da gravação foi encerrado. O arquivo será finalizado no banco de dados.`,
      'recording',
    );

    const endTime = Date.now();
    let fileSize = 0;
    try {
      fileSize = statSync(item.recording.filePath).size;
    } catch {
      /* arquivo pode não existir se falhou cedo */
    }
    const duration = Math.round((endTime - item.recording.startTime) / 1000);
    const completed = fileSize > 0;
    finalizeRecording(item.recording.id, {
      endTime,
      duration,
      fileSize,
      status: completed ? 'completed' : 'error',
    });

    // Marca as detecções no próprio vídeo (traços finos), se habilitado. Só em clipes
    // por evento/movimento/manual — nunca nos segmentos 24/7 (preserva o baixo CPU).
    if (completed && item.recording.type !== 'continuous' && getSettings().overlayDetectionMarks) {
      void overlayDetections({ ...item.recording, endTime, duration, fileSize, status: 'completed' });
    }
  }
}

export const recordingService = new RecordingService();
