import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { SystemStatus, StorageUsage, ServerInfo } from '../shared/types';

function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Painel de saúde do sistema: câmeras, CPU/RAM, armazenamento e servidor local.
export function DashboardView() {
  const cameras = useStore((s) => s.cameras);
  const setView = useStore((s) => s.setView);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);

  useEffect(() => {
    async function refresh() {
      setStatus(await window.svl.system.status());
      setUsage(await window.svl.system.storageUsage());
      setServer(await window.svl.system.serverInfo());
    }
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const online = cameras.filter((c) => c.status === 'online').length;
  const recording = cameras.filter((c) => c.recordContinuous).length;
  const storagePct =
    usage && usage.limitBytes ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0;

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h2>Painel</h2>
          <p className="muted">Saúde do sistema em tempo real.</p>
        </div>
      </div>

      <div className="dash-cards">
        <div className="dash-card">
          <span className="dash-label">Câmeras online</span>
          <span className="dash-value">
            {online}/{cameras.length}
          </span>
          <button className="btn small" onClick={() => setView('live')}>
            Ver ao vivo
          </button>
        </div>
        <div className="dash-card">
          <span className="dash-label">Gravando 24/7</span>
          <span className="dash-value">{recording}</span>
        </div>
        <div className="dash-card">
          <span className="dash-label">CPU</span>
          <span className="dash-value">{status ? `${status.cpuUsage}%` : '—'}</span>
        </div>
        <div className="dash-card">
          <span className="dash-label">Memória</span>
          <span className="dash-value">{status ? `${status.memoryUsage}%` : '—'}</span>
        </div>
        <div className="dash-card">
          <span className="dash-label">Tempo ativo</span>
          <span className="dash-value">{status ? formatUptime(status.uptime) : '—'}</span>
        </div>
        <div className="dash-card">
          <span className="dash-label">Gravações</span>
          <span className="dash-value">{usage?.recordingCount ?? status?.recordingCount ?? 0}</span>
        </div>
      </div>

      <div className="storage-panel">
        <h3>Armazenamento</h3>
        {usage ? (
          <>
            <div className="storage-bar">
              <div className="storage-fill" style={{ width: `${storagePct}%` }} />
            </div>
            <p className="muted">
              {gb(usage.usedBytes)} usados
              {usage.limitBytes ? ` de ${gb(usage.limitBytes)}` : ' (sem limite definido)'}
            </p>
          </>
        ) : (
          <p className="muted">Calculando…</p>
        )}
      </div>

      <div className="storage-panel">
        <h3>Servidor local</h3>
        {server ? (
          <p className="muted">
            Status:{' '}
            <b style={{ color: server.running ? 'var(--ok)' : 'var(--danger)' }}>
              {server.running ? 'Ativo' : 'Inativo'}
            </b>{' '}
            • Porta {server.port}
          </p>
        ) : (
          <p className="muted">Carregando…</p>
        )}
      </div>
    </div>
  );
}
