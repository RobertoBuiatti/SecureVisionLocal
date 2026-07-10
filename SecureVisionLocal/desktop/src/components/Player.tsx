import { useEffect, useRef, useState } from 'react';
import JSMpeg, { Player as JSMpegPlayer } from '@cycjimmy/jsmpeg-player';

// Inicia o stream no núcleo (FFmpeg → WebSocket) e renderiza com jsmpeg no canvas.
// Failover high→low é automático no backend; o frontend não escolhe qualidade.
export function Player({ cameraId }: { cameraId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Recebe o status do stream (running / erro) vindo do núcleo.
    const unsub = window.svl.events.onStreamStatus((p) => {
      if (p.cameraId !== cameraId) return;
      if (p.status === 'running') {
        setConnecting(false);
        setError(null);
      } else if (p.status === 'error') {
        setConnecting(false);
        setError(p.error ?? 'Sem sinal');
      }
    });

    async function startStream() {
      try {
        const info = await window.svl.streaming.start(cameraId, 'high');
        if (cancelled || !canvasRef.current) return;
        // Stream já estava ativo (mantido entre telas) → conecta direto.
        if (info.status === 'running') setConnecting(false);
        const url = `ws://localhost:${info.wsPort}`;
        playerRef.current = new JSMpeg.Player(url, {
          canvas: canvasRef.current,
          audio: false,
          autoplay: true,
          pauseWhenHidden: false,
        });
      } catch (e) {
        if (!cancelled) {
          setConnecting(false);
          setError(e instanceof Error ? e.message : 'Falha ao iniciar stream');
        }
      }
    }

    startStream();

    // Importante: NÃO paramos o stream ao desmontar (trocar de tela). O stream
    // permanece vivo no núcleo para a câmera não desconectar; só encerramos o
    // player local (jsmpeg). O stream é parado apenas ao remover a câmera/fechar.
    return () => {
      cancelled = true;
      unsub();
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
    };
  }, [cameraId]);

  return (
    <div className="player">
      <canvas ref={canvasRef} className="player-canvas" />
      {error && <div className="player-error">⚠ {error}</div>}
      {!error && connecting && <div className="player-connecting">Conectando…</div>}
    </div>
  );
}
