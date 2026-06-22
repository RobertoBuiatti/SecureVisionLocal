import { useStore, type View } from '../store';

const ITEMS: { view: View; label: string; icon: string }[] = [
  { view: 'live', label: 'Ao Vivo', icon: '◉' },
  { view: 'dashboard', label: 'Painel', icon: '▦' },
  { view: 'timeline', label: 'Linha do Tempo', icon: '⏱' },
  { view: 'recordings', label: 'Gravações', icon: '⏺' },
  { view: 'detections', label: 'Detecções', icon: '⚠' },
  { view: 'discovery', label: 'Descobrir', icon: '🔍' },
  { view: 'settings', label: 'Configurações', icon: '⚙' },
];

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const status = useStore((s) => s.status);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-logo">◈</span>
        <span className="brand-name">SecureVision</span>
      </div>
      <nav className="nav">
        {ITEMS.map((item) => (
          <button
            key={item.view}
            className={view === item.view ? 'nav-item active' : 'nav-item'}
            onClick={() => setView(item.view)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      {status && (
        <div className="sidebar-status">
          <div>
            Câmeras: <b>{status.camerasOnline}</b>/{status.camerasTotal}
          </div>
          <div>CPU: {status.cpuUsage}%</div>
          <div>RAM: {status.memoryUsage}%</div>
          <div>
            Disco: {status.storageUsedGB}/{status.storageTotalGB} GB
          </div>
        </div>
      )}
    </aside>
  );
}
