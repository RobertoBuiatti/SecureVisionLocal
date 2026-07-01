import { useEffect, useMemo, useState } from 'react';
import { useStore, orderCameras } from '../store';
import { CameraTile } from './CameraTile';

// Grade multi-câmera com posicionamento livre:
// - Arraste um bloco sobre outro para TROCAR as posições (ordem persistida).
// - Quando há mais câmeras que células, a grade é paginada (antes as excedentes
//   simplesmente não apareciam).
export function CameraGrid() {
  const cameras = useStore((s) => s.cameras);
  const gridLayout = useStore((s) => s.gridLayout);
  const cameraOrder = useStore((s) => s.cameraOrder);
  const swapCameras = useStore((s) => s.swapCameras);
  const setView = useStore((s) => s.setView);

  const [page, setPage] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = useMemo(() => orderCameras(cameras, cameraOrder), [cameras, cameraOrder]);
  const totalPages = Math.max(1, Math.ceil(ordered.length / gridLayout));

  // Mantém a página válida quando o layout muda ou câmeras são removidas.
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);

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
  const start = Math.min(page, totalPages - 1) * gridLayout;
  const visible = ordered.slice(start, start + gridLayout);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {visible.map((camera) => (
          <div
            key={camera.id}
            className={`grid-cell${dragId === camera.id ? ' dragging' : ''}${
              overId === camera.id && dragId && dragId !== camera.id ? ' drag-over' : ''
            }`}
            draggable
            title="Arraste sobre outra câmera para trocar as posições"
            onDragStart={(e) => {
              setDragId(camera.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', camera.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overId !== camera.id) setOverId(camera.id);
            }}
            onDragLeave={() => {
              if (overId === camera.id) setOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const source = dragId ?? e.dataTransfer.getData('text/plain');
              if (source && source !== camera.id) void swapCameras(source, camera.id);
              setDragId(null);
              setOverId(null);
            }}
          >
            <CameraTile camera={camera} />
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="grid-pager">
          <button className="btn small" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            ◀ Anterior
          </button>
          <span className="muted">
            Página {Math.min(page, totalPages - 1) + 1} de {totalPages} • {ordered.length} câmeras
          </span>
          <button
            className="btn small"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Próxima ▶
          </button>
        </div>
      )}
    </>
  );
}
