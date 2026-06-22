import { useEffect, useRef, useState } from 'react';
import JSMpeg, { Player as JSMpegPlayer } from '@cycjimmy/jsmpeg-player';
import type { Recording } from '../shared/types';

interface Props {
  recording: Recording;
  onClose: () => void;
}

// Reproduz uma gravação via FFmpeg → WebSocket → jsmpeg (compatível com HEVC).
export function RecordingPlayerModal({ recording, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const info = await window.svl.recording.playStart(recording.id);
        if (cancelled || !canvasRef.current) return;
        playerRef.current = new JSMpeg.Player(`ws://localhost:${info.wsPort}`, {
          canvas: canvasRef.current,
          audio: false,
          autoplay: true,
          pauseWhenHidden: false,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao reproduzir');
      }
    }
    start();
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      window.svl.recording.playStop(recording.id);
    };
  }, [recording.id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal player-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {recording.cameraName ?? recording.cameraId} —{' '}
          {new Date(recording.startTime).toLocaleString('pt-BR')}
        </h3>
        <div className="rec-player">
          <canvas ref={canvasRef} className="rec-canvas" />
          {error && <div className="player-error">⚠ {error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
