import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Recording } from '../shared/types';
import { RecordingPlayerModal } from '../components/RecordingPlayerModal';

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// Lista de gravações armazenadas localmente.
// Rótulos amigáveis do tipo de gravação e do gatilho de detecção.
const TYPE_LABEL: Record<string, string> = {
  manual: 'Manual',
  continuous: '24/7',
  motion: 'Movimento',
  event: 'Evento',
};

const DETECTION_LABEL: Record<string, { label: string; cls: string }> = {
  motion: { label: '🏃 Movimento', cls: 'det-motion' },
  person: { label: '🧍 Pessoa', cls: 'det-person' },
  vehicle: { label: '🚗 Veículo', cls: 'det-vehicle' },
  animal: { label: '🐾 Animal', cls: 'det-animal' },
};

export function RecordingsView() {
  const recordings = useStore((s) => s.recordings);
  const loadRecordings = useStore((s) => s.loadRecordings);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  async function remove(id: string) {
    await window.svl.recording.remove(id);
    loadRecordings();
  }

  async function exportRec(id: string) {
    const res = await window.svl.recording.export(id);
    // alert() nativo bloqueia o processo — mensagem inline no lugar.
    if (res.saved) setExportMsg(`Gravação exportada para: ${res.path}`);
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h2>Gravações</h2>
          <p className="muted">Vídeos gravados em disco local.</p>
        </div>
        <button className="btn" onClick={loadRecordings}>
          Atualizar
        </button>
      </div>
      {exportMsg && <p className="muted">{exportMsg}</p>}

      <div className="table-wrapper"><table className="table">
        <thead>
          <tr>
            <th>Câmera</th>
            <th>Tipo</th>
            <th>Início</th>
            <th>Duração</th>
            <th>Tamanho</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {recordings.map((rec) => (
            <tr key={rec.id}>
              <td>{rec.cameraName ?? rec.cameraId}</td>
              <td>
                {rec.detectionType && DETECTION_LABEL[rec.detectionType] ? (
                  <span className={`badge ${DETECTION_LABEL[rec.detectionType].cls}`}>
                    {DETECTION_LABEL[rec.detectionType].label}
                  </span>
                ) : (
                  TYPE_LABEL[rec.type] ?? rec.type
                )}
              </td>
              <td>{new Date(rec.startTime).toLocaleString('pt-BR')}</td>
              <td>{formatDuration(rec.duration)}</td>
              <td>{formatBytes(rec.fileSize)}</td>
              <td>
                <span className={`badge ${rec.status}`}>{rec.status}</span>
              </td>
              <td className="rec-actions">
                <button
                  className="btn small primary"
                  onClick={() => setPlaying(rec)}
                  disabled={rec.status !== 'completed' || rec.fileSize === 0}
                >
                  ▶ Reproduzir
                </button>
                <button
                  className="btn small"
                  onClick={() => exportRec(rec.id)}
                  disabled={rec.fileSize === 0}
                  title="Exportar para uma pasta"
                >
                  ⬇ Exportar
                </button>
                <button className="btn small danger" onClick={() => remove(rec.id)}>
                  Excluir
                </button>
              </td>
            </tr>
          ))}
          {recordings.length === 0 && (
            <tr>
              <td colSpan={7} className="muted center">
                Nenhuma gravação ainda. Inicie uma gravação na tela Ao Vivo.
              </td>
            </tr>
          )}
        </tbody>
      </table></div>

      {playing && <RecordingPlayerModal recording={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
