import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import type { DetectionConfig, DetectionEvent, AiStatus } from '../shared/types';

const TYPE_LABEL: Record<string, string> = {
  motion: 'Movimento',
  person: 'Pessoa',
  vehicle: 'Veículo',
  animal: 'Animal',
};

// Card de configuração de detecção de uma câmera.
function CameraDetectionCard({
  cameraId,
  cameraName,
  onboardTracking,
}: {
  cameraId: string;
  cameraName: string;
  onboardTracking: boolean;
}) {
  const [cfg, setCfg] = useState<DetectionConfig | null>(null);

  useEffect(() => {
    window.svl.detection.getConfig(cameraId).then(setCfg);
  }, [cameraId]);

  async function update(patch: Partial<DetectionConfig>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    await window.svl.detection.setConfig(cameraId, next);
  }

  if (!cfg) return null;

  return (
    <div className="det-card">
      <div className="det-card-head">
        <b>{cameraName}</b>
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.motionEnabled}
            onChange={(e) => update({ motionEnabled: e.target.checked })}
          />
          Detectar movimento
        </label>
      </div>

      {cfg.motionEnabled && (
        <div className="det-sens">
          Sensibilidade: {cfg.sensitivity}
          <input
            type="range"
            min={1}
            max={100}
            value={cfg.sensitivity}
            onChange={(e) => update({ sensitivity: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="det-card-head">
        <span className="muted">Detecção por IA</span>
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.aiEnabled}
            onChange={(e) => update({ aiEnabled: e.target.checked })}
          />
          Detectar pessoa / animal / veículo (IA)
        </label>
      </div>

      <div className="det-record">
        <span className="muted">Gravar quando detectar:</span>
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.recordMotion}
            disabled={!cfg.motionEnabled}
            onChange={(e) => update({ recordMotion: e.target.checked })}
          />
          Movimento
        </label>
        {(
          [
            ['recordPerson', 'Pessoa'],
            ['recordAnimal', 'Animal'],
            ['recordVehicle', 'Veículo'],
          ] as [keyof DetectionConfig, string][]
        ).map(([key, label]) => (
          <label className={cfg.aiEnabled ? 'check' : 'check disabled'} key={key}>
            <input
              type="checkbox"
              checked={!!cfg[key]}
              disabled={!cfg.aiEnabled}
              onChange={(e) => update({ [key]: e.target.checked } as Partial<DetectionConfig>)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="det-track">
        <label className={cfg.aiEnabled ? 'check' : 'check disabled'}>
          <input
            type="checkbox"
            checked={cfg.trackEnabled}
            disabled={!cfg.aiEnabled}
            onChange={(e) => update({ trackEnabled: e.target.checked })}
          />
          Acompanhar (PTZ) o objeto detectado
        </label>
        {cfg.trackEnabled && cfg.aiEnabled && onboardTracking && (
          <p className="probe-msg">
            ⚠ Esta câmera está marcada como tendo rastreamento próprio — quem segue o objeto é a
            câmera. O software não envia comandos PTZ (evita conflito). Desmarque "auto-track" na
            edição da câmera para o software assumir o controle.
          </p>
        )}
        {cfg.trackEnabled && cfg.aiEnabled && !onboardTracking && (
          <label className="track-dur">
            por
            <input
              type="number"
              min={3}
              value={cfg.trackSeconds}
              onChange={(e) => update({ trackSeconds: Number(e.target.value) })}
            />
            s após a última detecção
          </label>
        )}
      </div>

      <div className="det-snap">
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.captureSnapshot}
            onChange={(e) => update({ captureSnapshot: e.target.checked })}
          />
          Capturar snapshot ao detectar
        </label>
      </div>
    </div>
  );
}

// Tela de detecções: configuração por câmera + log de eventos em tempo real.
export function DetectionsView() {
  const cameras = useStore((s) => s.cameras);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);

  const loadEvents = useCallback(async () => {
    setEvents(await window.svl.detection.listEvents());
  }, []);

  useEffect(() => {
    loadEvents();
    window.svl.detection.aiStatus().then(setAi);
    const unsub = window.svl.detection.onEvent((ev) => {
      setEvents((prev) => [ev, ...prev].slice(0, 200));
    });
    const t = setInterval(() => window.svl.detection.aiStatus().then(setAi), 5000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [loadEvents]);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h2>Detecções</h2>
          <p className="muted">
            Detecção de movimento (rápida) e por IA (pessoa, animal, veículo).
            Escolha o que cada câmera deve gravar.
          </p>
        </div>
      </div>

      {ai && (
        <div className={`ai-banner ${ai.available ? '' : 'warn'}`}>
          {ai.downloading
            ? '⏳ Baixando modelo de IA…'
            : ai.objectModel
              ? '🧠 IA pronta — detecção de pessoa, animal e veículo ativa'
              : ai.message}
          {!ai.downloading && !ai.objectModel && (
            <span className="muted"> · Pasta de modelos: {ai.modelsDir}</span>
          )}
        </div>
      )}

      <div className="det-cards">
        {cameras.map((c) => (
          <CameraDetectionCard
            key={c.id}
            cameraId={c.id}
            cameraName={c.name}
            onboardTracking={c.hasOnboardTracking}
          />
        ))}
        {cameras.length === 0 && <p className="muted">Adicione câmeras para configurar detecções.</p>}
      </div>

      <h3 style={{ marginTop: 24 }}>Eventos recentes</h3>
      <div className="table-wrapper"><table className="table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Câmera</th>
            <th>Tipo</th>
            <th>Intensidade</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const cam = cameras.find((c) => c.id === ev.cameraId);
            return (
              <tr key={ev.id}>
                <td>{new Date(ev.timestamp).toLocaleString('pt-BR')}</td>
                <td>{cam?.name ?? ev.cameraName ?? ev.cameraId}</td>
                <td>
                  <span className={`badge det-${ev.type}`}>{TYPE_LABEL[ev.type] ?? ev.type}</span>
                </td>
                <td>{ev.score ?? '—'}</td>
              </tr>
            );
          })}
          {events.length === 0 && (
            <tr>
              <td colSpan={4} className="muted center">
                Nenhum evento ainda. Ative "Detectar movimento" numa câmera.
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
    </div>
  );
}
