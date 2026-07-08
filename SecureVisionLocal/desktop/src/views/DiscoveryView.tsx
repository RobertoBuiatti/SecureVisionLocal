import { useState } from 'react';
import { useStore } from '../store';
import type { DiscoveredCamera } from '../shared/types';
import { AddCameraModal } from '../components/AddCameraModal';

// Tela de descoberta de câmeras WiFi/IP na rede local.
export function DiscoveryView() {
  const discovered = useStore((s) => s.discovered);
  const isScanning = useStore((s) => s.isScanning);
  const scan = useStore((s) => s.scan);
  const [selected, setSelected] = useState<DiscoveredCamera | undefined>();
  const [showModal, setShowModal] = useState(false);

  function openAdd(cam?: DiscoveredCamera) {
    setSelected(cam);
    setShowModal(true);
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h2>Descobrir câmeras</h2>
          <p className="muted">
            Busca câmeras WiFi/IP na sua rede via ONVIF e varredura de portas (RTSP).
          </p>
        </div>
        <div className="view-actions">
          <button className="btn primary" onClick={scan} disabled={isScanning}>
            {isScanning ? 'Buscando...' : 'Buscar na rede'}
          </button>
          <button className="btn" onClick={() => openAdd()}>
            + Adicionar manual
          </button>
        </div>
      </div>

      {isScanning && <div className="scanning">🔍 Varrendo a rede local…</div>}

      <div className="table-wrapper"><table className="table">
        <thead>
          <tr>
            <th>IP</th>
            <th>Porta</th>
            <th>Fabricante</th>
            <th>Origem</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {discovered.map((cam) => (
            <tr key={`${cam.ip}:${cam.port}`}>
              <td>{cam.ip}</td>
              <td>{cam.port}</td>
              <td>{cam.manufacturer ?? cam.model ?? '—'}</td>
              <td>
                <span className={`badge ${cam.source}`}>{cam.source}</span>
              </td>
              <td>
                <button className="btn small" onClick={() => openAdd(cam)}>
                  Adicionar
                </button>
              </td>
            </tr>
          ))}
          {!isScanning && discovered.length === 0 && (
            <tr>
              <td colSpan={5} className="muted center">
                Nenhuma câmera encontrada ainda. Clique em "Buscar na rede".
              </td>
            </tr>
          )}
        </tbody>
      </table></div>

      {showModal && <AddCameraModal prefill={selected} onClose={() => setShowModal(false)} />}
    </div>
  );
}
