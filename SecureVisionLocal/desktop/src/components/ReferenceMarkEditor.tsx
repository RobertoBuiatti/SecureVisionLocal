import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReferenceMark } from '../shared/types';

interface DraftMark {
  type: 'line' | 'zone';
  points: { x: number; y: number }[];
  expectedDistanceLeft: number;
  expectedDistanceTop: number;
  tolerance: number;
}

interface ReferenceMarkEditorProps {
  presetId: string;
  presetName: string;
  onClose: () => void;
}

const LINE_COLOR = '#00ff88';
const ZONE_COLOR = '#ff8800';
const HANDLE_RADIUS = 4;

export function ReferenceMarkEditor({ presetId, presetName, onClose }: ReferenceMarkEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [drawingMode, setDrawingMode] = useState<'line' | 'zone' | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<number | null>(null);

  useEffect(() => {
    window.svl.ptz.presetSnapshot(presetId).then(setSnapshotUrl);
    window.svl.ptz.getReferenceMarks(presetId).then((existing) => {
      setMarks(
        existing.map((m) => ({
          type: m.type,
          points: m.points.map((p) => ({ ...p })),
          expectedDistanceLeft: m.expectedDistanceLeft,
          expectedDistanceTop: m.expectedDistanceTop,
          tolerance: m.tolerance,
        })),
      );
    });
  }, [presetId]);

  const imgLoaded = useCallback(() => {
    if (imgRef.current) {
      setImgNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    }
  }, []);

  const getCanvasScale = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return { scaleX: 1, scaleY: 1, dispW: 1, dispH: 1 };
    const dispW = canvas.clientWidth;
    const dispH = canvas.clientHeight;
    return {
      scaleX: dispW / img.naturalWidth,
      scaleY: dispH / img.naturalHeight,
      dispW,
      dispH,
    };
  }, []);

  const canvasToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const { scaleX, scaleY } = getCanvasScale();
      return { x: px / scaleX / imgNatural.w, y: py / scaleY / imgNatural.h };
    },
    [getCanvasScale, imgNatural],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { scaleX, scaleY, dispW, dispH } = getCanvasScale();
    canvas.width = dispW;
    canvas.height = dispH;
    ctx.clearRect(0, 0, dispW, dispH);

    function toDisp(p: { x: number; y: number }) {
      return { x: p.x * img!.naturalWidth * scaleX, y: p.y * img!.naturalHeight * scaleY };
    }

    marks.forEach((m, idx) => {
      const isSelected = idx === selectedIndex;
      ctx.strokeStyle = m.type === 'line' ? LINE_COLOR : ZONE_COLOR;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash(isSelected ? [] : [4, 4]);

      if (m.type === 'line' && m.points.length >= 2) {
        const a = toDisp(m.points[0]);
        const b = toDisp(m.points[1]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (m.type === 'zone' && m.points.length >= 4) {
        ctx.beginPath();
        const p0 = toDisp(m.points[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < 4; i++) {
          const p = toDisp(m.points[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle + '22';
        ctx.fill();
      }

      ctx.setLineDash([]);
      m.points.forEach((p) => {
        const dp = toDisp(p);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : ctx.strokeStyle;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });

    if (currentPoints.length > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      const pts = currentPoints.map(toDisp);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const targetPts = drawingMode === 'zone' && currentPoints.length === 1 ? 4 : drawingMode === 'line' ? 2 : 0;
      if (currentPoints.length < targetPts) {
        const last = pts[pts.length - 1];
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(last.x, last.y, HANDLE_RADIUS + 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [marks, currentPoints, selectedIndex, drawingMode, getCanvasScale]);

  useEffect(() => {
    draw();
  }, [draw, imgNatural]);

  function handleCanvasDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (drawingMode) {
      const norm = canvasToNorm(e.clientX, e.clientY);
      const targetPts = drawingMode === 'zone' ? 4 : 2;
      const newPoints = [...currentPoints, norm];

      if (newPoints.length < targetPts) {
        setCurrentPoints(newPoints);
      } else {
        const pts = newPoints.slice(0, targetPts);
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        setMarks((prev) => [
          ...prev,
          {
            type: drawingMode,
            points: pts,
            expectedDistanceLeft: Math.round(cx * 128),
            expectedDistanceTop: Math.round(cy * 128),
            tolerance: 10,
          },
        ]);
        setCurrentPoints([]);
        setDrawingMode(null);
      }
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { scaleX, scaleY } = getCanvasScale();
    const mx = (e.clientX - rect.left) / scaleX / imgNatural.w;
    const my = (e.clientY - rect.top) / scaleY / imgNatural.h;

    for (let mi = marks.length - 1; mi >= 0; mi--) {
      for (let pi = 0; pi < marks[mi].points.length; pi++) {
        const p = marks[mi].points[pi];
        const dist = Math.hypot(mx - p.x, my - p.y);
        if (dist < 0.02) {
          setSelectedIndex(mi);
          setDragIndex(mi);
          setDragPoint(pi);
          return;
        }
      }
    }

    setSelectedIndex(null);
  }

  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (dragIndex !== null && dragPoint !== null) {
      const norm = canvasToNorm(e.clientX, e.clientY);
      setMarks((prev) =>
        prev.map((m, mi) =>
          mi === dragIndex
            ? {
                ...m,
                points: m.points.map((p, pi) =>
                  pi === dragPoint ? { x: Math.max(0, Math.min(1, norm.x)), y: Math.max(0, Math.min(1, norm.y)) } : p,
                ),
              }
            : m,
        ),
      );
    }
  }

  function handleCanvasUp() {
    setDragIndex(null);
    setDragPoint(null);
  }

  function handleCanvasLeave() {
    setDragIndex(null);
    setDragPoint(null);
  }

  async function handleAutoDetect() {
    setDetecting(true);
    setDetectMsg(null);
    try {
      const features = await window.svl.ptz.detectFeatures(presetId);
      const newMarks: DraftMark[] = features.map((f) => ({
        type: f.type,
        points: f.points.map((p) => ({ x: p.x, y: p.y })),
        expectedDistanceLeft: f.expectedDistanceLeft,
        expectedDistanceTop: f.expectedDistanceTop,
        tolerance: f.tolerance,
      }));
      if (newMarks.length === 0) {
        // Antes isso falhava em silêncio. Agora explica o motivo mais provável.
        setDetectMsg(
          snapshotUrl
            ? 'Nenhuma marca detectada (imagem com pouca textura). Desenhe linhas/zonas manualmente.'
            : 'Sem imagem de referência. Recapture o snapshot do preset ("Salvar posição" ou "Recapturar") e tente de novo.',
        );
      } else {
        setMarks((prev) => [...prev, ...newMarks]);
      }
    } catch (e) {
      console.error('Erro ao detectar features:', e);
      setDetectMsg('Erro ao auto-detectar marcas. Verifique os logs da câmera.');
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await window.svl.ptz.saveReferenceMarks(presetId, marks);
      onClose();
    } catch (e) {
      console.error('Erro ao salvar marcas:', e);
    } finally {
      setSaving(false);
    }
  }

  function removeMark(index: number) {
    setMarks((prev) => prev.filter((_, i) => i !== index));
    if (selectedIndex === index) setSelectedIndex(null);
  }

  function updateMark(index: number, field: keyof DraftMark, value: unknown) {
    setMarks((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } as DraftMark : m)));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reference-editor-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Marcas de Referência — {presetName}</h3>

        <div className="ref-editor-layout">
          <div className="ref-canvas-area">
            <div className="ref-image-container">
              {snapshotUrl ? (
                <img
                  ref={imgRef}
                  src={snapshotUrl}
                  alt="Referência"
                  className="ref-image"
                  onLoad={imgLoaded}
                  draggable={false}
                />
              ) : (
                <div className="ref-image-placeholder">Carregando imagem…</div>
              )}
              <canvas
                ref={canvasRef}
                className="ref-canvas-overlay"
                onMouseDown={handleCanvasDown}
                onMouseMove={handleCanvasMove}
                onMouseUp={handleCanvasUp}
                onMouseLeave={handleCanvasLeave}
              />
            </div>
            <div className="ref-toolbar">
              <button
                className={`btn small ${drawingMode === 'line' ? 'active' : ''}`}
                onClick={() => {
                  setDrawingMode(drawingMode === 'line' ? null : 'line');
                  setCurrentPoints([]);
                }}
              >
                ─ Linha
              </button>
              <button
                className={`btn small ${drawingMode === 'zone' ? 'active' : ''}`}
                onClick={() => {
                  setDrawingMode(drawingMode === 'zone' ? null : 'zone');
                  setCurrentPoints([]);
                }}
              >
                ▭ Zona
              </button>
              <button className="btn small" onClick={handleAutoDetect} disabled={detecting}>
                {detecting ? 'Detectando…' : '⟳ Auto-detectar'}
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  setMarks([]);
                  setSelectedIndex(null);
                }}
                disabled={marks.length === 0}
              >
                ✕ Limpar todas
              </button>
            </div>
            {detectMsg && <p className="probe-msg">{detectMsg}</p>}
          </div>

          <div className="ref-marks-panel">
            {marks.length === 0 && (
              <p className="muted">
                Nenhuma marca. Use os botões acima para desenhar linhas/zonas sobre a imagem ou auto-detectar.
              </p>
            )}
            {marks.map((m, idx) => (
              <div
                key={idx}
                className={`ref-mark-row ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => setSelectedIndex(idx)}
              >
                <div className="ref-mark-header">
                  <span className={`ref-mark-type ${m.type}`}>
                    {m.type === 'line' ? '─' : '▭'} #{idx + 1}
                  </span>
                  <span className="ref-mark-points">
                    {m.points.map((p) => `${Math.round(p.x * 128)},${Math.round(p.y * 128)}`).join(' ')}
                  </span>
                  <button className="btn small danger" onClick={() => removeMark(idx)}>
                    ✕
                  </button>
                </div>
                <div className="ref-mark-fields">
                  <label>
                    Dist.Esq
                    <input
                      type="number"
                      value={m.expectedDistanceLeft}
                      onChange={(e) => updateMark(idx, 'expectedDistanceLeft', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Dist.Top
                    <input
                      type="number"
                      value={m.expectedDistanceTop}
                      onChange={(e) => updateMark(idx, 'expectedDistanceTop', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Tol.
                    <input
                      type="number"
                      value={m.tolerance}
                      onChange={(e) => updateMark(idx, 'tolerance', Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || marks.length === 0}>
            {saving ? 'Salvando…' : `Salvar ${marks.length} marca${marks.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
