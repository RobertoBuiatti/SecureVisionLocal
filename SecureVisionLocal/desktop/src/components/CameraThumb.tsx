import type { Camera } from '../shared/types';
import { Player } from './Player';

interface Props {
  camera: Camera;
  active?: boolean;
  onClick?: () => void;
}

// Miniatura de câmera (vídeo + nome) usada na barra lateral do modo Destaque.
export function CameraThumb({ camera, active, onClick }: Props) {
  return (
    <div className={active ? 'thumb active' : 'thumb'} onClick={onClick}>
      <Player cameraId={camera.id} />
      <div className="thumb-label">
        <span className={`dot ${camera.status}`} />
        {camera.name}
      </div>
    </div>
  );
}
