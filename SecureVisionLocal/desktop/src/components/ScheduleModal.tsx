import { useEffect, useState } from 'react';
import type { Camera, RecordingSchedule } from '../shared/types';

interface ScheduleModalProps {
  camera: Camera;
  onClose: () => void;
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function emptySchedule(cameraId: string): RecordingSchedule {
  return {
    id: '',
    cameraId,
    enabled: true,
    startTime: '18:00',
    endTime: '06:00',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    createdAt: 0,
  };
}

// Gerencia janelas de gravação programada de uma câmera (por horário e dia da semana).
export function ScheduleModal({ camera, onClose }: ScheduleModalProps) {
  const [schedules, setSchedules] = useState<RecordingSchedule[]>([]);
  const [draft, setDraft] = useState<RecordingSchedule>(emptySchedule(camera.id));
  const [saving, setSaving] = useState(false);

  async function reload() {
    setSchedules(await window.svl.schedules.list(camera.id));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id]);

  function toggleDay(day: number) {
    setDraft((d) => ({
      ...d,
      daysOfWeek: d.daysOfWeek.includes(day)
        ? d.daysOfWeek.filter((x) => x !== day)
        : [...d.daysOfWeek, day].sort(),
    }));
  }

  async function add() {
    if (draft.daysOfWeek.length === 0) return;
    setSaving(true);
    try {
      await window.svl.schedules.set(draft);
      setDraft(emptySchedule(camera.id));
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(s: RecordingSchedule) {
    await window.svl.schedules.set({ ...s, enabled: !s.enabled });
    await reload();
  }

  async function remove(id: string) {
    await window.svl.schedules.delete(id);
    await reload();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Agendamento — {camera.name}</h3>
        <p className="muted">
          Fora destas janelas a câmera não grava (a menos que esteja marcada como 24/7). Uma janela
          cujo fim é menor que o início cruza a meia-noite.
        </p>

        <div className="schedule-list">
          {schedules.length === 0 && <p className="muted">Nenhum agendamento ainda.</p>}
          {schedules.map((s) => (
            <div className="schedule-row" key={s.id}>
              <label className="check">
                <input type="checkbox" checked={s.enabled} onChange={() => toggleEnabled(s)} />
              </label>
              <span>
                {s.startTime}–{s.endTime}
              </span>
              <span className="muted">
                {s.daysOfWeek.length === 7
                  ? 'Todos os dias'
                  : s.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ')}
              </span>
              <button className="btn small danger" onClick={() => remove(s.id)}>
                Excluir
              </button>
            </div>
          ))}
        </div>

        <h4>Novo agendamento</h4>
        <div className="row">
          <label>
            Início
            <input
              type="time"
              value={draft.startTime}
              onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
            />
          </label>
          <label>
            Fim
            <input
              type="time"
              value={draft.endTime}
              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
            />
          </label>
        </div>
        <div className="days-picker">
          {DAY_LABELS.map((label, day) => (
            <button
              key={label}
              className={draft.daysOfWeek.includes(day) ? 'btn small active' : 'btn small'}
              onClick={() => toggleDay(day)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
          <button
            className="btn primary"
            onClick={add}
            disabled={saving || draft.daysOfWeek.length === 0}
          >
            {saving ? 'Salvando…' : 'Adicionar agendamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
