import { useState } from 'react';
import type { Camera } from '../shared/types';
import { useStore } from '../store';

interface EditCameraModalProps {
  camera: Camera;
  onClose: () => void;
}

// Edição das configurações de uma câmera já cadastrada. Reaproveita o probe ONVIF
// para reobter as URLs reais caso o usuário troque credenciais.
export function EditCameraModal({ camera, onClose }: EditCameraModalProps) {
  const updateCameraFields = useStore((s) => s.updateCameraFields);
  const [form, setForm] = useState<Camera>({ ...camera });
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  function set<K extends keyof Camera>(key: K, value: Camera[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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
        setProbeMsg('Não respondeu via ONVIF. Verifique usuário/senha (ou edite a URL manualmente).');
        return;
      }
      setForm((f) => ({
        ...f,
        streamUrl: info.streamUri ?? f.streamUrl,
        subStreamUrl: info.subStreamUri ?? f.subStreamUrl,
        manufacturer: info.manufacturer ?? f.manufacturer,
        onvifPort: info.onvifPort ?? f.onvifPort,
        hasPTZ: info.hasPTZ,
      }));
      setProbeMsg(`✓ ${info.manufacturer ?? ''} ${info.model ?? ''} — URLs atualizadas.`);
    } catch {
      setProbeMsg('Erro ao consultar ONVIF.');
    } finally {
      setProbing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateCameraFields(camera.id, {
        name: form.name,
        ip: form.ip,
        port: form.port,
        username: form.username,
        password: form.password,
        streamUrl: form.streamUrl,
        subStreamUrl: form.subStreamUrl,
        onvifPort: form.onvifPort,
        hasPTZ: form.hasPTZ,
        hasAudio: form.hasAudio,
        hasOnboardTracking: form.hasOnboardTracking,
        recordContinuous: form.recordContinuous,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Editar câmera</h3>
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
            <input value={form.username ?? ''} onChange={(e) => set('username', e.target.value)} />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={form.password ?? ''}
              onChange={(e) => set('password', e.target.value)}
            />
          </label>
        </div>
        <div className="onvif-probe">
          <button className="btn" onClick={probeOnvif} disabled={probing || !form.ip}>
            {probing ? 'Buscando…' : '🔎 Reobter dados (ONVIF)'}
          </button>
          <span className="muted">Atualiza marca, PTZ e as URLs RTSP automaticamente.</span>
        </div>
        {probeMsg && <p className="probe-msg">{probeMsg}</p>}
        <label>
          URL RTSP (principal)
          <input
            value={form.streamUrl}
            placeholder="rtsp://usuario:senha@ip:554/stream"
            onChange={(e) => set('streamUrl', e.target.value)}
          />
        </label>
        <label>
          URL do substream (usado na grade — opcional)
          <input
            value={form.subStreamUrl ?? ''}
            placeholder="rtsp://usuario:senha@ip:554/substream"
            onChange={(e) => set('subStreamUrl', e.target.value)}
          />
        </label>
        <label>
          Porta ONVIF (PTZ — opcional)
          <input
            type="number"
            value={form.onvifPort ?? 0}
            onChange={(e) => set('onvifPort', Number(e.target.value) || undefined)}
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
              checked={form.hasAudio}
              onChange={(e) => set('hasAudio', e.target.checked)}
            />
            Possui áudio
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
              checked={form.hasOnboardTracking}
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
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
