import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store';
import type { DetectionSnapshot } from '../shared/types';

const TYPE_LABEL: Record<string, string> = {
  motion: 'Movimento',
  person: 'Pessoa',
  vehicle: 'Veículo',
  animal: 'Animal',
};

export function SnapshotsView() {
  const cameras = useStore((s) => s.cameras);
  const [snapshots, setSnapshots] = useState<DetectionSnapshot[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const list = await window.svl.detection.listSnapshots(selectedCamera || undefined);
    setSnapshots(list);
  }, [selectedCamera]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const pending = snapshots.filter((s) => !loadedRef.current.has(s.id));
    if (pending.length === 0) return;

    let cancelled = false;

    async function loadImages() {
      const results = await Promise.all(
        pending.map(async (s) => {
          const url = await window.svl.detection.getSnapshotFile(s.id);
          return { id: s.id, url };
        }),
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const r of results) {
        if (r.url) {
          map[r.id] = r.url;
          loadedRef.current.add(r.id);
        }
      }
      setImages((prev) => ({ ...prev, ...map }));
    }

    loadImages();
    return () => { cancelled = true; };
  }, [snapshots]);

  async function handleDelete(id: string) {
    await window.svl.detection.deleteSnapshot(id);
    loadedRef.current.delete(id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    setImages((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const camMap = new Map(cameras.map((c) => [c.id, c.name]));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h2>Snapshots</h2>
          <p className="muted">
            Capturas automáticas de detecção de movimento e IA.
          </p>
        </div>
        <div className="snap-filters">
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
          >
            <option value="">Todas as câmeras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn" onClick={load}>↻</button>
        </div>
      </div>

      {snapshots.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 48 }}>
          Nenhum snapshot ainda. Ative "Capturar snapshot ao detectar" na tela de Detecções.
        </p>
      ) : (
        <div className="snap-grid">
          {snapshots.map((s) => (
            <div key={s.id} className="snap-card">
              <div className="snap-img" onClick={() => setZoom(s.id)}>
                {images[s.id] ? (
                  <img src={images[s.id]} alt={s.id} />
                ) : (
                  <div className="snap-placeholder">carregando…</div>
                )}
              </div>
              <div className="snap-info">
                <span className={`badge det-${s.detectionType}`}>
                  {TYPE_LABEL[s.detectionType] ?? s.detectionType}
                </span>
                <span className="muted">
                  {camMap.get(s.cameraId) ?? s.cameraName ?? s.cameraId}
                </span>
                <span className="muted">
                  {new Date(s.timestamp).toLocaleString('pt-BR')}
                </span>
                {s.score != null && <span>{s.score}%</span>}
                <button className="btn small danger" onClick={() => handleDelete(s.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <div className="modal snap-zoom" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setZoom(null)}>✕</button>
            {images[zoom] && <img src={images[zoom]} alt="zoom" />}
          </div>
        </div>
      )}
    </div>
  );
}
