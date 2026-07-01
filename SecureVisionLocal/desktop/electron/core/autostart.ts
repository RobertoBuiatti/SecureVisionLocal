import { app } from 'electron';
import { getSettings } from './settings';

// Aplica "Iniciar com o Windows" conforme a configuração salva. Antes o toggle da UI
// não fazia nada; agora é sincronizado na inicialização e a cada alteração.
export function applyStartWithWindows(): void {
  try {
    if (!app.isPackaged) return; // em dev apontaria para o electron.exe do node_modules
    app.setLoginItemSettings({
      openAtLogin: getSettings().startWithWindows,
      path: process.execPath,
    });
  } catch (err) {
    console.log(`[main] setLoginItemSettings falhou: ${err}`);
  }
}
