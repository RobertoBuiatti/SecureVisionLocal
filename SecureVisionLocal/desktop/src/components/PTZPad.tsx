import { useEffect, useRef } from 'react';
import type { PTZCommand, PTZDirection } from '../shared/types';

interface PTZPadProps {
  cameraId: string;
}

// Reenvia o comando enquanto o botão está pressionado, um pouco mais rápido que o
// watchdog do backend (1500ms). Assim segurar o botão mantém o movimento e, se o
// "stop" se perder, a câmera para sozinha logo após o último keepalive.
const KEEPALIVE_MS = 600;

// D-pad de controle PTZ. Envia comandos contínuos enquanto o botão é pressionado.
export function PTZPad({ cameraId }: PTZPadProps) {
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function send(cmd: PTZCommand) {
    window.svl.ptz.control(cameraId, cmd);
  }

  function stopHold() {
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
  }

  function hold(cmd: PTZCommand) {
    send(cmd);
    stopHold();
    holdRef.current = setInterval(() => send(cmd), KEEPALIVE_MS);
  }

  function stop() {
    stopHold();
    send({ action: 'stop' });
  }

  // Garante a parada se o componente for desmontado com um botão "preso".
  useEffect(() => () => stopHold(), []);

  // Handlers comuns a mouse e toque para cada botão de "segurar".
  const holdProps = (cmd: PTZCommand) => ({
    onMouseDown: () => hold(cmd),
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      hold(cmd);
    },
    onTouchEnd: stop,
    onTouchCancel: stop,
  });

  const moveProps = (direction: PTZDirection) => holdProps({ action: 'move', direction, speed: 50 });

  return (
    <div className="ptzpad">
      <div className="ptz-row">
        <button {...moveProps('up-left')}>↖</button>
        <button {...moveProps('up')}>↑</button>
        <button {...moveProps('up-right')}>↗</button>
      </div>
      <div className="ptz-row">
        <button {...moveProps('left')}>←</button>
        <button className="ptz-center" onClick={stop}>■</button>
        <button {...moveProps('right')}>→</button>
      </div>
      <div className="ptz-row">
        <button {...moveProps('down-left')}>↙</button>
        <button {...moveProps('down')}>↓</button>
        <button {...moveProps('down-right')}>↘</button>
      </div>
      <div className="ptz-row zoom">
        <button {...holdProps({ action: 'zoom-out', speed: 50 })}>－</button>
        <span>Zoom</span>
        <button {...holdProps({ action: 'zoom-in', speed: 50 })}>＋</button>
      </div>
    </div>
  );
}
