import { useEffect, useState, useCallback } from 'react';
import type {
  PTZPreset,
  PTZTour,
  PTZTourStep,
  PTZTourStatus,
  PositionCheckResult,
} from '../shared/types';

interface PTZTourPanelProps {
  cameraId: string;
  onClose: () => void;
}

export function PTZTourPanel({ cameraId, onClose }: PTZTourPanelProps) {
  const [presets, setPresets] = useState<PTZPreset[]>([]);
  const [snaps, setSnaps] = useState<Record<string, string>>({});
  const [tours, setTours] = useState<PTZTour[]>([]);
  const [status, setStatus] = useState<PTZTourStatus | null>(null);
  const [presetName, setPresetName] = useState('');
  const [steps, setSteps] = useState<PTZTourStep[]>([]);
  const [tourName, setTourName] = useState('');
  const [editingTourId, setEditingTourId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checkResults, setCheckResults] = useState<PositionCheckResult[]>([]);

  const refresh = useCallback(async () => {
    const ps = await window.svl.ptz.listPresets(cameraId);
    setPresets(ps);
    setTours(await window.svl.ptz.listTours(cameraId));
    setStatus(await window.svl.ptz.tourStatus(cameraId));
    // carrega miniaturas
    const map: Record<string, string> = {};
    await Promise.all(
      ps.map(async (p) => {
        const url = await window.svl.ptz.presetSnapshot(p.id);
        if (url) map[p.id] = url;
      }),
    );
    setSnaps(map);
  }, [cameraId]);

  useEffect(() => {
    refresh();
    const t = setInterval(async () => {
      setStatus(await window.svl.ptz.tourStatus(cameraId));
    }, 2000);
    return () => clearInterval(t);
  }, [refresh, cameraId]);

  async function savePreset() {
    if (!presetName.trim()) return;
    setBusy(true);
    try {
      const created = await window.svl.ptz.savePreset(cameraId, presetName.trim());
      if (!created) alert('Não foi possível salvar (a câmera suporta ONVIF PTZ?).');
      else {
        setPresetName('');
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function addStep(p: PTZPreset) {
    setSteps((s) => [...s, { presetToken: p.token, presetName: p.name, dwellSeconds: 10 }]);
  }
  const updateDwell = (i: number, d: number) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, dwellSeconds: d } : st)));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  async function saveTour() {
    if (!tourName.trim() || steps.length === 0) return;
    if (editingTourId) await window.svl.ptz.updateTour(editingTourId, tourName.trim(), steps);
    else await window.svl.ptz.createTour(cameraId, tourName.trim(), steps);
    setTourName('');
    setSteps([]);
    setEditingTourId(null);
    await refresh();
  }

  function editTour(t: PTZTour) {
    setEditingTourId(t.id);
    setTourName(t.name);
    setSteps(t.steps);
  }
  function cancelEdit() {
    setEditingTourId(null);
    setTourName('');
    setSteps([]);
  }

  async function verifyPositions() {
    setVerifying(true);
    try {
      const results = await window.svl.ptz.verifyPositions(cameraId);
      setCheckResults(results);
      await refresh();
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tour-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Rota PTZ (patrulha em ciclo)</h3>

        {/* 1. Posições com miniatura */}
        <section className="tour-section">
          <h4>1. Posições salvas</h4>
          <p className="muted">
            Mova a câmera (PTZ) até o ponto e salve. A imagem da posição é guardada como referência.
          </p>
          <div className="row">
            <input
              placeholder="Nome da posição (ex.: Portão)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button className="btn primary" onClick={savePreset} disabled={busy || !presetName.trim()}>
              Salvar posição atual
            </button>
          </div>
          <div className="preset-grid">
            {presets.map((p) => (
              <div key={p.id} className="preset-item">
                <div className="preset-thumb">
                  {snaps[p.id] ? <img src={snaps[p.id]} alt={p.name} /> : <span>sem imagem</span>}
                  {p.lastCheckAt != null && (
                    <span className={`pos-badge ${p.lastCheckOk ? 'ok' : 'bad'}`}>
                      {p.lastCheckOk ? '✓' : '✗'} {p.lastCheckScore}
                    </span>
                  )}
                </div>
                <div className="preset-name">{p.name}</div>
                <div className="preset-btns">
                  <button onClick={() => window.svl.ptz.gotoPreset(cameraId, p.token)}>Ir</button>
                  <button onClick={() => addStep(p)}>+ rota</button>
                  <button
                    onClick={async () => {
                      await window.svl.ptz.deletePreset(p.id);
                      refresh();
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {presets.length === 0 && <p className="muted">Nenhuma posição salva ainda.</p>}
          </div>
          {presets.some((p) => p.snapshotPath) && (
            <button className="btn" onClick={verifyPositions} disabled={verifying}>
              {verifying ? 'Verificando…' : '🔍 Verificar posições agora (IA)'}
            </button>
          )}
          {checkResults.length > 0 && (
            <ul className="check-results">
              {checkResults.map((r) => (
                <li key={r.presetId} className={r.ok ? 'ok' : 'bad'}>
                  {r.ok ? '✓' : '✗'} {r.presetName} (diferença {r.score})
                  {r.corrected && ' — reposicionada automaticamente 🔧'}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. Montar/editar rota */}
        <section className="tour-section">
          <h4>2. {editingTourId ? 'Editar rota' : 'Montar a rota'}</h4>
          {steps.length === 0 && (
            <p className="muted">Use "+ rota" nas posições para montar a sequência.</p>
          )}
          <ol className="steps">
            {steps.map((st, i) => (
              <li key={i}>
                <span className="step-name">{st.presetName}</span>
                <label>
                  permanecer
                  <input
                    type="number"
                    min={1}
                    value={st.dwellSeconds}
                    onChange={(e) => updateDwell(i, Number(e.target.value))}
                  />
                  s
                </label>
                <button onClick={() => moveStep(i, -1)} title="Subir">↑</button>
                <button onClick={() => moveStep(i, 1)} title="Descer">↓</button>
                <button onClick={() => removeStep(i)} title="Remover">✕</button>
              </li>
            ))}
          </ol>
          {steps.length > 0 && (
            <div className="row">
              <input
                placeholder="Nome da rota"
                value={tourName}
                onChange={(e) => setTourName(e.target.value)}
              />
              <button className="btn primary" onClick={saveTour} disabled={!tourName.trim()}>
                {editingTourId ? 'Salvar alterações' : 'Salvar rota'}
              </button>
              {editingTourId && (
                <button className="btn" onClick={cancelEdit}>
                  Cancelar
                </button>
              )}
            </div>
          )}
        </section>

        {/* 3. Executar em ciclo */}
        <section className="tour-section">
          <h4>3. Executar em ciclo</h4>
          <ul className="tour-list">
            {tours.map((t) => {
              const running = status?.running && status.tourId === t.id;
              return (
                <li key={t.id}>
                  <span>
                    <b>{t.name}</b> — {t.steps.length} posições
                    {running && (
                      <span className="running"> ● em ciclo (pos. {(status!.stepIndex ?? 0) + 1})</span>
                    )}
                  </span>
                  <span className="tour-actions">
                    {running ? (
                      <button className="btn small" onClick={() => window.svl.ptz.stopTour(cameraId)}>
                        ⏸ Parar
                      </button>
                    ) : (
                      <button
                        className="btn small primary"
                        onClick={async () => {
                          await window.svl.ptz.startTour(t.id);
                          setStatus(await window.svl.ptz.tourStatus(cameraId));
                        }}
                      >
                        ▶ Iniciar
                      </button>
                    )}
                    <button className="btn small" onClick={() => editTour(t)}>
                      Editar
                    </button>
                    <button
                      className="btn small danger"
                      onClick={async () => {
                        await window.svl.ptz.deleteTour(t.id);
                        refresh();
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
            {tours.length === 0 && <li className="muted">Nenhuma rota salva ainda.</li>}
          </ul>
        </section>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
