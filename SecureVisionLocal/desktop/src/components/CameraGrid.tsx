import { useStore } from '../store';
import { CameraTile } from './CameraTile';

// Grade multi-câmera. O número de colunas deriva do layout selecionado (4=2x2, 9=3x3...).
export function CameraGrid() {
  const cameras = useStore((s) => s.cameras);
  const gridLayout = useStore((s) => s.gridLayout);
  const setView = useStore((s) => s.setView);

  if (cameras.length === 0) {
    return (
      <div className="empty">
        <h2>Nenhuma câmera adicionada</h2>
        <p>Descubra câmeras WiFi na sua rede para começar a monitorar.</p>
        <button className="btn primary" onClick={() => setView('discovery')}>
          Descobrir câmeras
        </button>
      </div>
    );
  }

  const cols = Math.sqrt(gridLayout) % 1 === 0 ? Math.sqrt(gridLayout) : 2;
  const visible = cameras.slice(0, gridLayout);

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {visible.map((camera) => (
        <CameraTile key={camera.id} camera={camera} />
      ))}
    </div>
  );
}
