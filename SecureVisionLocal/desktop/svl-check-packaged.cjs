/* Verifica o EXECUTÁVEL empacotado (release/win-unpacked), não o código fonte:
 * abre o app instalado, cadastra uma câmera de teste e confere que a tela cheia mostra
 * somente o vídeo, ocupando o monitor inteiro.
 *
 * Uso: node svl-check-packaged.cjs   (a partir de desktop/, após `npm run build:win`)
 */
const { _electron } = require('playwright-core');
const { join } = require('node:path');
const { rmSync, existsSync } = require('node:fs');

const EXE = join(__dirname, 'release', 'win-unpacked', 'SecureVision Local.exe');
let failures = 0;
function ok(cond, label, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures += 1;
}

(async () => {
  if (!existsSync(EXE)) throw new Error(`executavel nao encontrado: ${EXE} — rode "npm run build:win"`);

  const userData = join(__dirname, 'svl-pack-data');
  rmSync(userData, { recursive: true, force: true });
  const app = await _electron.launch({
    executablePath: EXE,
    env: { ...process.env, SVL_USER_DATA: userData },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('.app', { timeout: 30000 });
  ok(true, 'executavel empacotado abre e carrega a interface');

  const camId = await win.evaluate(async () => {
    const cam = await window.svl.cameras.add({
      name: 'TesteCam Pack',
      ip: '127.0.0.1',
      port: 554,
      protocol: 'rtsp',
      type: 'ip',
      username: '',
      password: '',
      streamUrl: 'rtsp://127.0.0.1:554/pack',
      subStreamUrl: '',
      hasPTZ: false,
      hasAudio: false,
    });
    return cam?.id ?? null;
  });
  ok(!!camId, 'IPC do app empacotado responde (camera cadastrada)');

  await win.reload();
  await win.waitForSelector('.app');
  await win.waitForTimeout(1500);
  await win.click('.sidebar button:has-text("Ao Vivo")').catch(() => {});
  await win.waitForSelector('.live-view');
  await win.click('button:has-text("Tela cheia")');
  await win.waitForTimeout(1200);

  const state = await win.evaluate(() => {
    const fs = document.fullscreenElement;
    const shown = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      if (fs && !fs.contains(el) && el !== fs) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const tile = document.querySelector('.fullscreen-view .tile-video');
    const tr = tile ? tile.getBoundingClientRect() : null;
    return {
      isFullscreen: !!fs,
      viewHeader: shown('.live-view .view-header'),
      tileToolbar: shown('.tile-toolbar'),
      screen: { w: window.innerWidth, h: window.innerHeight },
      videoArea: tr ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null,
    };
  });

  ok(state.isFullscreen, 'tela cheia real no app empacotado');
  ok(!state.viewHeader && !state.tileToolbar, 'so o video aparece em tela cheia');
  if (state.videoArea) {
    const cw = state.videoArea.w / state.screen.w;
    const ch = state.videoArea.h / state.screen.h;
    ok(cw > 0.99 && ch > 0.99, 'video cobre o monitor inteiro',
      `${(cw * 100).toFixed(1)}% x ${(ch * 100).toFixed(1)}%`);
  } else {
    ok(false, 'area de video encontrada');
  }

  await app.close();
  rmSync(userData, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} verificacao(oes) falharam`);
    process.exit(1);
  }
  console.log('\nOK: executavel empacotado validado');
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
