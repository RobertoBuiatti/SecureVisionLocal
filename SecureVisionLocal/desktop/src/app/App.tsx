import { useEffect } from 'react';
import { useStore } from '../store';
import { Sidebar } from '../components/Sidebar';
import { LiveView } from '../views/LiveView';
import { DashboardView } from '../views/DashboardView';
import { TimelineView } from '../views/TimelineView';
import { DiscoveryView } from '../views/DiscoveryView';
import { RecordingsView } from '../views/RecordingsView';
import { DetectionsView } from '../views/DetectionsView';
import { SettingsView } from '../views/SettingsView';

export function App() {
  const view = useStore((s) => s.view);
  const loadCameras = useStore((s) => s.loadCameras);
  const loadSettings = useStore((s) => s.loadSettings);
  const loadStatus = useStore((s) => s.loadStatus);
  const setCameraStatus = useStore((s) => s.setCameraStatus);

  useEffect(() => {
    loadCameras();
    loadSettings();
    loadStatus();

    const statusTimer = setInterval(loadStatus, 5000);
    const unsub = window.svl.events.onCameraStatus((p) =>
      setCameraStatus(p.cameraId, p.status as never),
    );

    return () => {
      clearInterval(statusTimer);
      unsub();
    };
  }, [loadCameras, loadSettings, loadStatus, setCameraStatus]);

  return (
    <div className="app">
      <Sidebar />
      <main className="content">
        {view === 'live' && <LiveView />}
        {view === 'dashboard' && <DashboardView />}
        {view === 'timeline' && <TimelineView />}
        {view === 'discovery' && <DiscoveryView />}
        {view === 'recordings' && <RecordingsView />}
        {view === 'detections' && <DetectionsView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
