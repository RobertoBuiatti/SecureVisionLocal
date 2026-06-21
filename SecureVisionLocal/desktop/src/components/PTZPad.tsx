import type { PTZCommand, PTZDirection } from '../shared/types';

interface PTZPadProps {
  cameraId: string;
}

// D-pad de controle PTZ. Envia comandos contínuos enquanto o botão é pressionado.
export function PTZPad({ cameraId }: PTZPadProps) {
  function send(cmd: PTZCommand) {
    window.svl.ptz.control(cameraId, cmd);
  }
  const move = (direction: PTZDirection) => () => send({ action: 'move', direction, speed: 50 });
  const stop = () => send({ action: 'stop' });

  return (
    <div className="ptzpad">
      <div className="ptz-row">
        <button onMouseDown={move('up-left')} onMouseUp={stop} onMouseLeave={stop}>↖</button>
        <button onMouseDown={move('up')} onMouseUp={stop} onMouseLeave={stop}>↑</button>
        <button onMouseDown={move('up-right')} onMouseUp={stop} onMouseLeave={stop}>↗</button>
      </div>
      <div className="ptz-row">
        <button onMouseDown={move('left')} onMouseUp={stop} onMouseLeave={stop}>←</button>
        <button className="ptz-center" onClick={stop}>■</button>
        <button onMouseDown={move('right')} onMouseUp={stop} onMouseLeave={stop}>→</button>
      </div>
      <div className="ptz-row">
        <button onMouseDown={move('down-left')} onMouseUp={stop} onMouseLeave={stop}>↙</button>
        <button onMouseDown={move('down')} onMouseUp={stop} onMouseLeave={stop}>↓</button>
        <button onMouseDown={move('down-right')} onMouseUp={stop} onMouseLeave={stop}>↘</button>
      </div>
      <div className="ptz-row zoom">
        <button onMouseDown={() => send({ action: 'zoom-out', speed: 50 })} onMouseUp={stop}>－</button>
        <span>Zoom</span>
        <button onMouseDown={() => send({ action: 'zoom-in', speed: 50 })} onMouseUp={stop}>＋</button>
      </div>
    </div>
  );
}
