import { useEffect, useRef, useState } from 'react';
import JSMpeg, { Player as JSMpegPlayer } from '@cycjimmy/jsmpeg-player';

// Recria o decoder se nenhum quadro for desenhado neste intervalo. Rede de segurança para
// travamentos que o backend não reporta (ex.: quadros descartados por buffer cheio do
// WebSocket — ver WS_MAX_BUFFERED_BYTES em streaming.ts).
const FRAME_STALL_MS = 10000;
const FRAME_CHECK_MS = 2000;
// O núcleo diz que o stream está de pé mas o decoder não desenhou NADA desde que foi
// montado: ele entrou no meio do MPEG-TS e ficou sem cabeçalho de sequência. Sem isto o
// canvas fica branco para sempre (o watchdog de quadros acima só arma DEPOIS do 1º quadro).
const MOUNT_TIMEOUT_MS = 6000;

// Inicia o stream no núcleo (FFmpeg → WebSocket) e renderiza com jsmpeg no canvas.
// Failover high→low é automático no backend; o frontend não escolhe qualidade.
export function Player({ cameraId }: { cameraId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<JSMpegPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  // O canvas do jsmpeg nasce BRANCO e continua branco em toda REMONTAGEM do decoder. Isto
  // (e não `connecting`) é o que decide escondê-lo: `connecting` já é falso quando o
  // watchdog de quadros ou a volta da bandeja recriam o decoder, e aí o branco aparecia.
  const [hasImage, setHasImage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A porta do WebSocket NÃO muda entre reinícios do FFmpeg (o backend preserva o
    // WebSocketServer de propósito), então a URL é guardada uma vez e reusada nas recriações.
    let wsUrl: string | null = null;
    let wasDown = false; // houve queda desde o último 'running'
    let streamRunning = false; // o núcleo está entregando quadros (≠ o decoder estar desenhando)
    let gotFrame = false; // já decodificou algum quadro desde a última criação
    let lastFrameAt = Date.now();

    // Cria (ou RECRIA) o decoder. Recriar é a única cura para a imagem travada: o backend
    // preserva o WebSocket entre respawns do FFmpeg, então nada derruba o jsmpeg — ele
    // recebe um stream MPEG-TS novo no meio do fluxo e congela o último quadro.
    function mountJsmpeg(): void {
      if (cancelled || !wsUrl || !canvasRef.current) return;
      // Janela minimizada/na bandeja: não há o que desenhar. Ver o visibilitychange abaixo.
      if (document.visibilityState === 'hidden') return;
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      gotFrame = false;
      lastFrameAt = Date.now();
      setHasImage(false); // esconde o canvas branco até o 1º quadro DESTA montagem
      playerRef.current = new JSMpeg.Player(wsUrl, {
        canvas: canvasRef.current,
        audio: false,
        autoplay: true,
        // Fica false de propósito: a visibilidade é tratada no onVisibility abaixo, e o
        // listener que o jsmpeg registraria NÃO é removido no destroy() dele — vazaria um
        // a cada recriação do decoder.
        pauseWhenHidden: false,
        onVideoDecode: () => {
          // Só no 1º quadro: isto roda 25x/s por câmera, e um setState por quadro
          // derrubaria o renderer inteiro.
          if (!gotFrame) {
            gotFrame = true;
            setHasImage(true);
          }
          lastFrameAt = Date.now();
        },
      });
    }

    // Recebe o status do stream (running / erro) vindo do núcleo.
    const unsub = window.svl.events.onStreamStatus((p) => {
      if (p.cameraId !== cameraId) return;
      if (p.status === 'running') {
        streamRunning = true;
        setConnecting(false);
        setError(null);
        // Voltou de uma queda (ou de um restart do FFmpeg): o decoder atual está preso no
        // stream antigo. Sem isto a imagem fica congelada até trocar de tela e voltar.
        if (wasDown) {
          wasDown = false;
          mountJsmpeg();
        }
      } else if (p.status === 'error') {
        streamRunning = false;
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
        // Stream já ativo: o evento 'running' NÃO virá de novo (só sai no 1º quadro da
        // sessão), então o estado tem de ser semeado aqui.
        streamRunning = info.status === 'running';
        if (streamRunning) setConnecting(false);
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

    // Janela escondida (minimizada/bandeja): o Chromium já suspende o requestAnimationFrame,
    // então o decode do jsmpeg para sozinho -- mas o WebSocket continua recebendo o MPEG-TS,
    // o demuxer continua rodando no callback de rede e o processo principal continua copiando
    // cada quadro para um socket que ninguém lê. Soltar o decoder fecha esse socket e zera os
    // três. A puxada RTSP, a gravação 24/7 e a detecção vivem no backend e NÃO são afetadas
    // (o Player já não para o stream nem ao desmontar — ver o cleanup no fim).
    // Ao voltar, o decoder é recriado do zero: ~0,5s até o próximo cabeçalho de sequência.
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') {
        try {
          playerRef.current?.destroy();
        } catch {
          /* noop */
        }
        playerRef.current = null;
      } else {
        mountJsmpeg();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    // ponytail: watchdog de quadros no cliente. O evento error→running acima cobre o caso
    // conhecido; isto é a rede para travamentos sem erro reportado. Só arma DEPOIS do
    // primeiro quadro — enquanto a câmera nunca entregou imagem o problema não é o decoder,
    // e recriar em loop não ajudaria. Com a janela escondida o mountJsmpeg vira no-op.
    const frameWatchdog = setInterval(() => {
      const silent = Date.now() - lastFrameAt; // lastFrameAt é reposto em cada montagem
      if (!gotFrame) {
        // Nunca desenhou desde que montou. Só é problema do decoder se o núcleo estiver
        // entregando quadros — com a câmera fora do ar, remontar em loop não cura nada.
        if (streamRunning && silent > MOUNT_TIMEOUT_MS) mountJsmpeg();
        return;
      }
      if (silent > FRAME_STALL_MS) mountJsmpeg();
    }, FRAME_CHECK_MS);

    // Importante: NÃO paramos o stream ao desmontar (trocar de tela). O stream
    // permanece vivo no núcleo para a câmera não desconectar; só encerramos o
    // player local (jsmpeg). O stream é parado apenas ao remover a câmera/fechar.
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
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
          preto do bloco, que é o que se espera de um monitor de CFTV. Isso vale para TODA
          montagem do decoder (watchdog de quadros, volta da bandeja), não só a primeira —
          por isso quem manda aqui é o `hasImage`, e não o `connecting`. */}
      <canvas ref={canvasRef} className={hasImage ? 'player-canvas' : 'player-canvas idle'} />
      {error && <div className="player-error">⚠ {error}</div>}
      {!error && connecting && <div className="player-connecting">Conectando…</div>}
    </div>
  );
}
