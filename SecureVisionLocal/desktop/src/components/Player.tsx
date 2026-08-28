import { useEffect, useRef, useState } from 'react';
import JSMpeg, { Player as JSMpegPlayer } from '@cycjimmy/jsmpeg-player';

// Recria o decoder se nenhum quadro for desenhado neste intervalo. Rede de segurança para
// travamentos que o backend não reporta (ex.: quadros descartados por buffer cheio do
// WebSocket — ver WS_MAX_BUFFERED_BYTES em streaming.ts).
const FRAME_STALL_MS = 20000;
const FRAME_CHECK_MS = 5000;

// Inicia o stream no núcleo (FFmpeg → WebSocket) e renderiza com jsmpeg no canvas.
// Failover high→low é automático no backend; o frontend não escolhe qualidade.
export function Player({ cameraId }: { cameraId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // A porta do WebSocket NÃO muda entre reinícios do FFmpeg (o backend preserva o
    // WebSocketServer de propósito), então a URL é guardada uma vez e reusada nas recriações.
    let wsUrl: string | null = null;
    let wasDown = false; // houve queda desde o último 'running'
    let gotFrame = false; // já decodificou algum quadro desde a última criação
    let lastFrameAt = Date.now();

    // Cria (ou RECRIA) o decoder. Recriar é a única cura para a imagem travada: o backend
    // preserva o WebSocket entre respawns do FFmpeg, então nada derruba o jsmpeg — ele
    // recebe um stream MPEG-TS novo no meio do fluxo e congela o último quadro.
    function mountJsmpeg(): void {
      if (cancelled || !wsUrl || !canvasRef.current) return;
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      gotFrame = false;
      lastFrameAt = Date.now();
      playerRef.current = new JSMpeg.Player(wsUrl, {
        canvas: canvasRef.current,
        audio: false,
        autoplay: true,
        pauseWhenHidden: false,
        onVideoDecode: () => {
          gotFrame = true;
          lastFrameAt = Date.now();
        },
      });
    }

    // Recebe o status do stream (running / erro) vindo do núcleo.
    const unsub = window.svl.events.onStreamStatus((p) => {
      if (p.cameraId !== cameraId) return;
      if (p.status === 'running') {
        setConnecting(false);
        setError(null);
        // Voltou de uma queda (ou de um restart do FFmpeg): o decoder atual está preso no
        // stream antigo. Sem isto a imagem fica congelada até trocar de tela e voltar.
        if (wasDown) {
          wasDown = false;
          mountJsmpeg();
        }
      } else if (p.status === 'error') {
        wasDown = true;
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
        wsUrl = `ws://localhost:${info.wsPort}`;
        mountJsmpeg();
      } catch (e) {
        if (!cancelled) {
          setConnecting(false);
          setError(e instanceof Error ? e.message : 'Falha ao iniciar stream');
        }
      }
    }

    startStream();

    // ponytail: watchdog de quadros no cliente. O evento error→running acima cobre o caso
    // conhecido; isto é a rede para travamentos sem erro reportado. Só arma DEPOIS do
    // primeiro quadro — enquanto a câmera nunca entregou imagem o problema não é o decoder,
    // e recriar em loop a cada 20s não ajudaria.
    const frameWatchdog = setInterval(() => {
      if (!gotFrame) return;
      if (Date.now() - lastFrameAt > FRAME_STALL_MS) mountJsmpeg();
    }, FRAME_CHECK_MS);

    // Importante: NÃO paramos o stream ao desmontar (trocar de tela). O stream
    // permanece vivo no núcleo para a câmera não desconectar; só encerramos o
    // player local (jsmpeg). O stream é parado apenas ao remover a câmera/fechar.
    return () => {
      cancelled = true;
      unsub();
      clearInterval(frameWatchdog);
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
      {/* O canvas do jsmpeg nasce BRANCO e só escurece quando chega o primeiro quadro —
          em tela cheia isso vira um monitor inteiro branco enquanto a câmera conecta (ou
          se o sinal cai). Enquanto não há imagem ele fica transparente e aparece o fundo
          preto do bloco, que é o que se espera de um monitor de CFTV. */}
      <canvas
        ref={canvasRef}
        className={error || connecting ? 'player-canvas idle' : 'player-canvas'}
      />
      {error && <div className="player-error">⚠ {error}</div>}
      {!error && connecting && <div className="player-connecting">Conectando…</div>}
    </div>
  );
}
