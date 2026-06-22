import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Recording, DetectionEvent } from '../shared/types';
import { RecordingPlayerModal } from '../components/RecordingPlayerModal';

const TYPE_LABEL: Record<string, string> = {
  motion: 'Movimento',
  person: 'Pessoa',
  vehicle: 'Veículo',
  animal: 'Animal',
};

function todayStr(): string {
  // Data local no formato YYYY-MM-DD (para o input[type=date]).
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// Fração do dia (0–1) a partir de um timestamp, relativo ao dia selecionado.
function dayFraction(ts: number, dayStart: number): number {
  const f = (ts - dayStart) / 86_400_000;
  return Math.max(0, Math.min(1, f));
}

// Linha do tempo (0–24h) de gravações e eventos de detecção por câmera e dia.
export function TimelineView() {
  const cameras = useStore((s) => s.cameras);
  const [cameraId, setCameraId] = useState<string>('');
  const [date, setDate] = useState<string>(todayStr());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [playing, setPlaying] = useState<Recording | null>(null);

  useEffect(() => {
    if (!cameraId && cameras.length) setCameraId(cameras[0].id);
  }, [cameras, cameraId]);

  useEffect(() => {
    if (!cameraId) return;
    window.svl.recording.list(cameraId).then(setRecordings);
    window.svl.detection.listEvents().then((all) => setEvents(all.filter((e) => e.cameraId === cameraId)));
  }, [cameraId]);

  const dayStart = useMemo(() => new Date(`${date}T00:00:00`).getTime(), [date]);
  const dayEnd = dayStart + 86_400_000;

  const dayRecordings = recordings.filter((r) => r.startTime < dayEnd && (r.endTime ?? Date.now()) > dayStart);
  const dayEvents = events.filter((e) => e.timestamp >= dayStart && e.timestamp < dayEnd);

  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h2>Linha do tempo</h2>
          <p className="muted">Gravações e eventos de detecção por dia.</p>
        </div>
        <div className="view-actions wrap">
          <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {cameras.length === 0 ? (
        <p className="muted">Adicione câmeras para ver a linha do tempo.</p>
      ) : (
        <div className="timeline">
          <div className="timeline-ruler">
            {hours.map((h) => (
              <span key={h} className="tl-hour" style={{ left: `${(h / 24) * 100}%` }}>
                {h}h
              </span>
            ))}
          </div>

          <div className="timeline-track recordings-track">
            {dayRecordings.map((r) => {
              const left = dayFraction(r.startTime, dayStart) * 100;
              const end = dayFraction(r.endTime ?? Date.now(), dayStart) * 100;
              return (
                <button
                  key={r.id}
                  className={`tl-block rec ${r.type}`}
                  style={{ left: `${left}%`, width: `${Math.max(0.5, end - left)}%` }}
                  title={`${r.type} • ${new Date(r.startTime).toLocaleTimeString('pt-BR')}`}
                  onClick={() => r.fileSize > 0 && setPlaying(r)}
                />
              );
            })}
            {dayRecordings.length === 0 && <span className="tl-empty">Sem gravações neste dia</span>}
          </div>

          <div className="timeline-track events-track">
            {dayEvents.map((ev) => (
              <span
                key={ev.id}
                className={`tl-marker det-${ev.type}`}
                style={{ left: `${dayFraction(ev.timestamp, dayStart) * 100}%` }}
                title={`${TYPE_LABEL[ev.type] ?? ev.type} • ${new Date(ev.timestamp).toLocaleTimeString('pt-BR')}`}
              />
            ))}
          </div>

          <div className="timeline-legend muted">
            <span>▮ Gravações (clique para reproduzir)</span>
            <span>● Eventos de detecção</span>
          </div>
        </div>
      )}

      {playing && <RecordingPlayerModal recording={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
