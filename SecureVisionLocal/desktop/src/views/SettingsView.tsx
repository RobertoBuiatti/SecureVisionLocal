import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { AppSettings, StorageUsage, ServerInfo } from '../shared/types';

function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

// Configurações do software: armazenamento, retenção, aceleração e inicialização.
export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const loadSettings = useStore((s) => s.loadSettings);
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [recycling, setRecycling] = useState(false);
  const [recycleMsg, setRecycleMsg] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    if (!settings) loadSettings();
    else setDraft(settings);
  }, [settings, loadSettings]);

  useEffect(() => {
    window.svl.system.storageUsage().then(setUsage);
    window.svl.system.serverInfo().then(setServerInfo);
  }, []);

  async function runRetention() {
    setRecycling(true);
    setRecycleMsg(null);
    try {
      const removed = await window.svl.system.runRetention();
      setUsage(await window.svl.system.storageUsage());
      setRecycleMsg(`Reciclagem concluída. ${removed} gravação(ões) antiga(s) removida(s).`);
    } finally {
      setRecycling(false);
    }
  }

  if (!draft) return <div className="view">Carregando…</div>;

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft) return;
    const updated = await window.svl.settings.update(draft);
    useStore.setState({ settings: updated, gridLayout: updated.gridLayout });
    setServerInfo(await window.svl.system.serverInfo());
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Configurações</h2>
        <button className="btn primary" onClick={save}>
          Salvar
        </button>
      </div>

      <div className="settings-grid">
        <label>
          Pasta de gravações
          <input
            value={draft.recordingsPath}
            onChange={(e) => set('recordingsPath', e.target.value)}
          />
        </label>
        <label>
          Retenção (dias)
          <input
            type="number"
            value={draft.retentionDays}
            onChange={(e) => set('retentionDays', Number(e.target.value))}
          />
        </label>
        <label>
          Limite de armazenamento (GB) — 0 = sem limite
          <input
            type="number"
            value={draft.maxStorageGB}
            onChange={(e) => set('maxStorageGB', Number(e.target.value))}
          />
        </label>
        <label>
          Duração de cada arquivo 24/7 (minutos)
          <input
            type="number"
            value={draft.continuousSegmentMinutes}
            onChange={(e) => set('continuousSegmentMinutes', Number(e.target.value))}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.autoRecycle}
            onChange={(e) => set('autoRecycle', e.target.checked)}
          />
          Reciclagem automática (sobrescrever as mais antigas ao atingir o limite)
        </label>
        <label>
          Aceleração por hardware
          <select
            value={draft.hardwareAcceleration}
            onChange={(e) =>
              set('hardwareAcceleration', e.target.value as AppSettings['hardwareAcceleration'])
            }
          >
            <option value="auto">Automática</option>
            <option value="nvenc">NVIDIA (NVDEC)</option>
            <option value="qsv">Intel Quick Sync</option>
            <option value="none">Desativada</option>
          </select>
        </label>
        <label>
          Layout padrão da grade
          <select value={draft.gridLayout} onChange={(e) => set('gridLayout', Number(e.target.value))}>
            <option value={1}>1x1</option>
            <option value={4}>2x2</option>
            <option value={9}>3x3</option>
            <option value={16}>4x4</option>
            <option value={25}>5x5</option>
            <option value={36}>6x6</option>
            <option value={64}>8x8</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.startWithWindows}
            onChange={(e) => set('startWithWindows', e.target.checked)}
          />
          Iniciar com o Windows
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.serverEnabled}
            onChange={(e) => set('serverEnabled', e.target.checked)}
          />
          Servidor local (app mobile / navegador)
        </label>
        <label>
          Porta do servidor
          <input
            type="number"
            value={draft.serverPort}
            onChange={(e) => set('serverPort', Number(e.target.value))}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.notificationsEnabled}
            onChange={(e) => set('notificationsEnabled', e.target.checked)}
          />
          Notificações do Windows ao detectar movimento / pessoa / veículo
        </label>
        <label>
          Webhook de alerta (opcional) — POST a cada detecção
          <input
            value={draft.webhookUrl}
            placeholder="https://exemplo.com/alerta"
            onChange={(e) => set('webhookUrl', e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.overlayDetectionMarks}
            onChange={(e) => set('overlayDetectionMarks', e.target.checked)}
          />
          Marcar detecções no vídeo (traços finos nos clipes por evento — usa mais CPU)
        </label>
      </div>

      <div className="storage-panel">
        <h3>Armazenamento</h3>
        {usage ? (
          <>
            <div className="storage-bar">
              <div
                className="storage-fill"
                style={{
                  width: usage.limitBytes
                    ? `${Math.min(100, (usage.usedBytes / usage.limitBytes) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            <p className="muted">
              {gb(usage.usedBytes)} usados
              {usage.limitBytes ? ` de ${gb(usage.limitBytes)}` : ' (sem limite definido)'} •{' '}
              {usage.recordingCount} gravação(ões)
              {usage.oldestRecordingTime
                ? ` • mais antiga: ${new Date(usage.oldestRecordingTime).toLocaleString('pt-BR')}`
                : ''}
            </p>
          </>
        ) : (
          <p className="muted">Calculando…</p>
        )}
        <button className="btn" onClick={runRetention} disabled={recycling}>
          {recycling ? 'Reciclando…' : 'Liberar espaço agora (reciclar antigas)'}
        </button>
        {recycleMsg && <p className="muted">{recycleMsg}</p>}
      </div>

      <div className="storage-panel">
        <h3>Acesso remoto (app mobile / navegador)</h3>
        {serverInfo ? (
          <>
            <p className="muted">
              Status:{' '}
              <b style={{ color: serverInfo.running ? 'var(--ok)' : 'var(--danger)' }}>
                {serverInfo.running ? 'Ativo' : 'Inativo'}
              </b>{' '}
              • Porta {serverInfo.port}
            </p>
            <p className="muted">Use estes endereços no app companheiro (mesma rede WiFi):</p>
            <ul className="server-urls">
              {serverInfo.urls.length === 0 && <li className="muted">Nenhuma rede detectada</li>}
              {serverInfo.urls.map((u) => (
                <li key={u}>
                  <code>{u}</code>
                </li>
              ))}
            </ul>
            <label>
              Token de acesso (mantenha em segredo)
              <input readOnly value={serverInfo.token} onFocus={(e) => e.target.select()} />
            </label>
            <p className="muted">
              Verificação: <code>GET /api/health</code> • Câmeras: <code>/api/cameras</code> • Live
              HLS: <code>/api/live/&lt;id&gt;/index.m3u8?token=…</code>
            </p>
          </>
        ) : (
          <p className="muted">Carregando…</p>
        )}
      </div>
    </div>
  );
}
