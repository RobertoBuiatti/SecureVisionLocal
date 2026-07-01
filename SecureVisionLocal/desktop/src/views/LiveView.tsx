import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, orderCameras } from '../store';
import { CameraGrid } from '../components/CameraGrid';
import { CameraTile } from '../components/CameraTile';
import { CameraThumb } from '../components/CameraThumb';

type Mode = 'grid' | 'spotlight' | 'fullscreen';

// Layouts da grade, exibidos conforme o número de câmeras. Com a paginação da grade,
// layouts grandes deixaram de ser obrigatórios para ver todas — são uma escolha.
const LAYOUTS = [
  { value: 1, label: '1x1', min: 1 },
  { value: 4, label: '2x2', min: 2 },
  { value: 9, label: '3x3', min: 5 },
  { value: 16, label: '4x4', min: 10 },
  { value: 25, label: '5x5', min: 17 },
  { value: 36, label: '6x6', min: 26 },
  { value: 64, label: '8x8', min: 37 },
];

export function LiveView() {
  const camerasRaw = useStore((s) => s.cameras);
  const cameraOrder = useStore((s) => s.cameraOrder);
  // A mesma ordem da grade vale para o destaque e para a alternância em tela cheia.
  const cameras = useMemo(() => orderCameras(camerasRaw, cameraOrder), [camerasRaw, cameraOrder]);
  const gridLayout = useStore((s) => s.gridLayout);
  const setGridLayout = useStore((s) => s.setGridLayout);
  const setView = useStore((s) => s.setView);

  const [mode, setMode] = useState<Mode>('grid');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [autoCycle, setAutoCycle] = useState(false);
  const [cycleSeconds, setCycleSeconds] = useState(10);
  const [mainPct, setMainPct] = useState(72);
  const containerRef = useRef<HTMLDivElement>(null);

  const focused = cameras.find((c) => c.id === focusedId) ?? cameras[0];
  const availableLayouts = LAYOUTS.filter((l) => l.value === 1 || cameras.length >= l.min);

  // Alternância automática entre câmeras (modos Destaque / Tela cheia).
  useEffect(() => {
    if (!autoCycle || cameras.length < 2) return;
    const t = setInterval(() => {
      setFocusedId((prev) => {
        const idx = cameras.findIndex((c) => c.id === (prev ?? cameras[0].id));
        return cameras[(idx + 1) % cameras.length].id;
      });
    }, Math.max(2, cycleSeconds) * 1000);
    return () => clearInterval(t);
  }, [autoCycle, cycleSeconds, cameras]);

  function osFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  function step(dir: 1 | -1) {
    if (!cameras.length) return;
    const idx = cameras.findIndex((c) => c.id === (focusedId ?? cameras[0].id));
    setFocusedId(cameras[(idx + dir + cameras.length) % cameras.length].id);
  }

  return (
    <div className="view live-view" ref={containerRef}>
      <div className="view-header">
        <div>
          <h2>Ao Vivo</h2>
          <p className="muted">{cameras.length} câmera(s)</p>
        </div>
        <div className="view-actions wrap">
          {/* Modo de exibição */}
          <div className="layout-switch">
            <button className={mode === 'grid' ? 'btn small active' : 'btn small'} onClick={() => setMode('grid')}>
              Grade
            </button>
            <button
              className={mode === 'spotlight' ? 'btn small active' : 'btn small'}
              onClick={() => setMode('spotlight')}
            >
              Destaque
            </button>
            <button
              className={mode === 'fullscreen' ? 'btn small active' : 'btn small'}
              onClick={() => setMode('fullscreen')}
            >
              Tela cheia
            </button>
          </div>

          {/* Layout da grade (por volume de câmeras) */}
          {mode === 'grid' && (
            <div className="layout-switch">
              {availableLayouts.map((l) => (
                <button
                  key={l.value}
                  className={gridLayout === l.value ? 'btn small active' : 'btn small'}
                  onClick={() => setGridLayout(l.value)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {/* Tamanho do destaque */}
          {mode === 'spotlight' && (
            <label className="track-dur">
              Tamanho
              <input
                type="range"
                min={50}
                max={85}
                value={mainPct}
                onChange={(e) => setMainPct(Number(e.target.value))}
              />
            </label>
          )}

          {/* Auto-alternância */}
          {(mode === 'spotlight' || mode === 'fullscreen') && (
            <label className="check">
              <input type="checkbox" checked={autoCycle} onChange={(e) => setAutoCycle(e.target.checked)} />
              Alternar a cada
              <input
                type="number"
                min={2}
                value={cycleSeconds}
                onChange={(e) => setCycleSeconds(Number(e.target.value))}
                style={{ width: 56, margin: '0 4px' }}
              />
              s
            </label>
          )}

          <button className="btn primary" onClick={() => setView('discovery')}>
            + Câmera
          </button>
        </div>
      </div>

      {cameras.length === 0 ? (
        <div className="empty">
          <h2>Nenhuma câmera</h2>
          <button className="btn primary" onClick={() => setView('discovery')}>
            Descobrir câmeras
          </button>
        </div>
      ) : mode === 'grid' ? (
        <CameraGrid />
      ) : mode === 'spotlight' ? (
        <div className="spotlight">
          <div className="spot-main" style={{ flexBasis: `${mainPct}%` }}>
            {focused && <CameraTile camera={focused} />}
          </div>
          <div className="spot-side">
            {cameras.map((c) => (
              <CameraThumb
                key={c.id}
                camera={c}
                active={c.id === focused?.id}
                onClick={() => setFocusedId(c.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="fullscreen-view">
          {focused && <CameraTile camera={focused} />}
          <div className="fs-nav">
            <button className="btn" onClick={() => step(-1)}>
              ◀
            </button>
            <span className="muted">{focused?.name}</span>
            <button className="btn" onClick={() => step(1)}>
              ▶
            </button>
            <button className="btn" onClick={osFullscreen} title="Tela cheia do monitor">
              ⛶ Monitor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
