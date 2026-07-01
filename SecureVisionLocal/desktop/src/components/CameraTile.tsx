import { useState } from 'react';
import type { Camera } from '../shared/types';
import { useStore } from '../store';
import { Player } from './Player';
import { PTZPad } from './PTZPad';
import { PTZTourPanel } from './PTZTourPanel';
import { EditCameraModal } from './EditCameraModal';
import { ScheduleModal } from './ScheduleModal';

interface CameraTileProps {
  camera: Camera;
}

// Bloco de uma câmera na grade: vídeo ao vivo + controles (gravar, PTZ, status).
export function CameraTile({ camera }: CameraTileProps) {
  const [recording, setRecording] = useState(false);
  const [showPtz, setShowPtz] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toggleContinuous = useStore((s) => s.toggleContinuous);
  const removeCamera = useStore((s) => s.removeCamera);

  // Aviso transitório no bloco (alert() nativo bloqueia o processo do Electron).
  function showNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 6000);
  }

  async function handleSnapshot() {
    setSnapping(true);
    try {
      const res = await window.svl.snapshot.capture(camera.id);
      if (res.saved) showNotice(`Snapshot salvo em ${res.path}`);
    } finally {
      setSnapping(false);
    }
  }

  async function handleRemove() {
    const ok = window.confirm(`Remover a câmera "${camera.name}"? As gravações em disco não são apagadas.`);
    if (ok) await removeCamera(camera.id);
  }

  async function toggleRecording() {
    setBusy(true);
    try {
      if (recording) {
        await window.svl.recording.stop(camera.id);
        setRecording(false);
      } else {
        await window.svl.recording.start(camera.id);
        setRecording(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tile">
      <div className="tile-video">
        <Player cameraId={camera.id} />
        <div className="tile-overlay-top">
          <span className={`dot ${camera.status}`} />
          <span className="tile-name">{camera.name}</span>
          {camera.recordContinuous && (
            <span className="badge-247" title="Gravando 24/7 (contínuo)">
              24/7
            </span>
          )}
        </div>
        <button className="tile-remove" onClick={handleRemove} title="Remover câmera">
          ✕
        </button>
        {showPtz && camera.hasPTZ && (
          <div className="tile-ptz">
            <PTZPad cameraId={camera.id} />
          </div>
        )}
      </div>
      <div className="tile-toolbar">
        <button
          className={recording ? 'btn rec active' : 'btn rec'}
          onClick={toggleRecording}
          disabled={busy}
          title={recording ? 'Parar gravação' : 'Gravar'}
        >
          {recording ? '■ Gravando' : '● Gravar'}
        </button>
        {camera.hasPTZ && (
          <button className="btn" onClick={() => setShowPtz((v) => !v)} title="Controle PTZ">
            PTZ
          </button>
        )}
        {camera.hasPTZ && (
          <button className="btn" onClick={() => setShowTour(true)} title="Rota PTZ (patrulha em ciclo)">
            Rota
          </button>
        )}
        <button
          className={camera.recordContinuous ? 'btn active' : 'btn'}
          onClick={() => toggleContinuous(camera.id, !camera.recordContinuous)}
          title="Gravação contínua 24/7 (recicla as mais antigas ao encher)"
        >
          24/7
        </button>
        <button className="btn" onClick={handleSnapshot} disabled={snapping} title="Capturar imagem">
          {snapping ? '…' : '📷'}
        </button>
        <button className="btn" onClick={() => setShowSchedule(true)} title="Agendar gravação">
          🗓
        </button>
        <button className="btn" onClick={() => setShowEdit(true)} title="Editar configurações">
          ⚙
        </button>
        <span className="tile-ip">{camera.ip}</span>
      </div>
      {notice && <div className="tile-notice">{notice}</div>}
      {showTour && <PTZTourPanel cameraId={camera.id} onClose={() => setShowTour(false)} />}
      {showEdit && <EditCameraModal camera={camera} onClose={() => setShowEdit(false)} />}
      {showSchedule && <ScheduleModal camera={camera} onClose={() => setShowSchedule(false)} />}
    </div>
  );
}
