import { useState } from 'react';
import type { CreateCameraDTO, DiscoveredCamera } from '../shared/types';
import { useStore } from '../store';

interface AddCameraModalProps {
  prefill?: DiscoveredCamera;
  onClose: () => void;
}

// Formulário de adição de câmera. Pré-preenche dados vindos da descoberta na rede.
export function AddCameraModal({ prefill, onClose }: AddCameraModalProps) {
  const addCamera = useStore((s) => s.addCamera);
  const defaultRtsp = prefill?.rtspUrls?.[0] ?? '';
  const [form, setForm] = useState<CreateCameraDTO>({
    name: prefill?.name ?? prefill?.model ?? `Câmera ${prefill?.ip ?? ''}`.trim(),
    ip: prefill?.ip ?? '',
    port: prefill?.port ?? 554,
    protocol: 'rtsp',
    manufacturer: prefill?.manufacturer,
    username: '',
    password: '',
    streamUrl: defaultRtsp,
    hasPTZ: false,
    recordContinuous: false,
  });
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  function set<K extends keyof CreateCameraDTO>(key: K, value: CreateCameraDTO[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Consulta a câmera via ONVIF e preenche marca/modelo/PTZ + a URL RTSP REAL.
  async function probeOnvif() {
    if (!form.ip) {
      setProbeMsg('Informe o IP da câmera.');
      return;
    }
    setProbing(true);
    setProbeMsg('Consultando a câmera via ONVIF…');
    try {
      const info = await window.svl.discovery.probeOnvif(form.ip, form.username ?? '', form.password ?? '');
      if (!info || !info.streamUri) {
        setProbeMsg('Não respondeu via ONVIF. Verifique usuário/senha (ou adicione a URL manualmente).');
        return;
      }
      setForm((f) => ({
        ...f,
        streamUrl: info.streamUri ?? f.streamUrl,
        subStreamUrl: info.subStreamUri ?? f.subStreamUrl,
        manufacturer: info.manufacturer ?? f.manufacturer,
        onvifPort: info.onvifPort ?? f.onvifPort,
        hasPTZ: info.hasPTZ,
        name: f.name && !f.name.startsWith('Câmera ') ? f.name : info.model ?? f.name,
      }));
      setProbeMsg(
        `✓ ${info.manufacturer ?? ''} ${info.model ?? ''} — URL de stream obtida automaticamente.`,
      );
    } catch {
      setProbeMsg('Erro ao consultar ONVIF.');
    } finally {
      setProbing(false);
    }
  }

  // Monta a URL RTSP com credenciais se o usuário não informou uma URL completa.
  function buildStreamUrl(): string {
    if (!form.streamUrl) {
      const auth = form.username ? `${form.username}:${form.password ?? ''}@` : '';
      return `rtsp://${auth}${form.ip}:${form.port}/`;
    }
    if (form.username && !form.streamUrl.includes('@')) {
      return form.streamUrl.replace(
        /^(rtsp|rtsps|rtmp|http|https):\/\//i,
        `$1://${encodeURIComponent(form.username)}:${encodeURIComponent(form.password ?? '')}@`,
      );
    }
    return form.streamUrl;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const camera = await window.svl.cameras.add({ ...form, streamUrl: buildStreamUrl() });
      addCamera(camera);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Adicionar câmera</h3>
        <label>
          Nome
          <input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <div className="row">
          <label>
            IP
            <input value={form.ip} onChange={(e) => set('ip', e.target.value)} />
          </label>
          <label>
            Porta
            <input
              type="number"
              value={form.port}
              onChange={(e) => set('port', Number(e.target.value))}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Usuário
            <input value={form.username} onChange={(e) => set('username', e.target.value)} />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </label>
        </div>
        <div className="onvif-probe">
          <button className="btn" onClick={probeOnvif} disabled={probing || !form.ip}>
            {probing ? 'Buscando…' : '🔎 Buscar dados (ONVIF)'}
          </button>
          <span className="muted">Preenche marca, modelo, PTZ e a URL RTSP real automaticamente.</span>
        </div>
        {probeMsg && <p className="probe-msg">{probeMsg}</p>}
        <label>
          URL RTSP (gerada via ONVIF ou manual)
          <input
            value={form.streamUrl}
            placeholder="rtsp://usuario:senha@ip:554/stream"
            onChange={(e) => set('streamUrl', e.target.value)}
          />
        </label>
        <div className="row checks">
          <label className="check">
            <input
              type="checkbox"
              checked={form.hasPTZ}
              onChange={(e) => set('hasPTZ', e.target.checked)}
            />
            Suporta PTZ
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.recordContinuous}
              onChange={(e) => set('recordContinuous', e.target.checked)}
            />
            Gravar 24/7
          </label>
        </div>
        {form.hasPTZ && (
          <label className="check">
            <input
              type="checkbox"
              checked={form.hasOnboardTracking ?? false}
              onChange={(e) => set('hasOnboardTracking', e.target.checked)}
            />
            A câmera já segue objetos sozinha (auto-track) — o software não comanda o PTZ
          </label>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || !form.ip}>
            {saving ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
