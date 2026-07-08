/* Teste das novas features (Fases 1-11) */
const { _electron } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const SHOT_DIR = process.env.SHOT_DIR || __dirname;
const shots = (n) => join(SHOT_DIR, n);
function ok(cond, label) { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); if (!cond) process.exitCode = 1; }
function randomId() { return 'test_' + Math.random().toString(36).slice(2, 10); }

(async () => {
  const userData = join(SHOT_DIR, 'svl-test-data');
  require('node:fs').rmSync(userData, { recursive: true, force: true });

  const app = await _electron.launch({ args: ['.'], cwd: __dirname, env: { ...process.env, SVL_USER_DATA: userData } });
  const page = await app.firstWindow();
  await page.waitForSelector('.sidebar', { timeout: 20000 });
  ok(true, 'app abriu');

  // 1. Configurações: campos snapshotsPath + snapshotsMaxCount
  await page.click('button.nav-item:has-text("Configurações")');
  await page.waitForSelector('.settings-grid', { timeout: 10000 });
  await page.waitForTimeout(400);
  ok(!!(await page.$('label:has-text("Pasta de snapshots") input')), 'campo snapshotsPath visível');
  ok(!!(await page.$('label:has-text("Máx. snapshots") input')), 'campo snapshotsMaxCount visível');
  await page.screenshot({ path: shots('nf1-settings-snapshots.png') });

  // 2. Detecções: captureSnapshot checkbox
  const camId = await page.evaluate(async () => (await window.svl.cameras.add({ name: 'TestDetect', ip: '192.0.2.99', port: 554, protocol: 'rtsp', streamUrl: 'rtsp://192.0.2.99:554/test', hasPTZ: false, hasAudio: false, recordContinuous: false })).id);
  ok(!!camId, `câmera criada (${camId})`);
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 20000 });
  await page.click('button.nav-item:has-text("Detecções")');
  await page.waitForSelector('.det-card', { timeout: 10000 });
  await page.waitForTimeout(500);
  ok(!!(await page.$('.det-snap .check input')), 'checkbox captureSnapshot visível');
  ok((await page.textContent('.det-snap .check')).includes('Capturar'), 'label correta');
  await page.screenshot({ path: shots('nf2-detection-checkbox.png') });

  // 3. PTZ + Marcas (ReferenceMarkEditor)
  const ptzCamId = await page.evaluate(async () => (await window.svl.cameras.add({ name: 'TestPTZ', ip: '192.0.2.100', port: 554, protocol: 'rtsp', streamUrl: 'rtsp://192.0.2.100:554/test', hasPTZ: true, hasAudio: false, recordContinuous: false })).id);
  ok(!!ptzCamId, `câmera PTZ criada (${ptzCamId})`);

  // Insere preset no banco (ONVIF não disponível em IP de teste)
  const electronExe = join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  const presetId = randomId();
  execFileSync(electronExe, [join(__dirname, 'svl-e2e-seed-ptz.cjs'), userData, ptzCamId, presetId], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });

  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 20000 });
  await page.waitForSelector('.grid-cell', { timeout: 10000 });
  await page.waitForTimeout(400);

  const rotaBtn = await page.$('.grid-cell .btn:has-text("Rota")');
  ok(!!rotaBtn, 'botão Rota visível');
  if (!rotaBtn) { await app.close(); return; }
  await rotaBtn.click();
  await page.waitForTimeout(1000);

  ok(!!(await page.$('.tour-modal .preset-item')), 'preset carregado no modal');

  // Importante: Marcas é o 3º botão em .preset-btns (Ir, + rota, Marcas, ✕)
  const marcasBtn = await page.$('.tour-modal .preset-btns button:nth-child(3)');
  ok(!!marcasBtn, 'botão "Marcas" (3º em preset-btns)');
  const marcasText = marcasBtn ? await marcasBtn.textContent() : '';
  ok(marcasText.trim() === 'Marcas', `texto do botão: "${marcasText.trim()}"`);

  if (marcasBtn) {
    await marcasBtn.click();
    await page.waitForTimeout(600);

    // Editor usa classe .reference-editor-modal
    ok(!!(await page.$('.reference-editor-modal')), 'ReferenceMarkEditor modal abriu');
    await page.screenshot({ path: shots('nf4-reference-mark-editor.png') });

    const cancelarBtn = await page.$('.reference-editor-modal .btn:has-text("Cancelar")');
    ok(!!cancelarBtn, 'botão Cancelar no editor');
    if (cancelarBtn) {
      await cancelarBtn.click();
      await page.waitForTimeout(400);
      ok(!(await page.$('.reference-editor-modal')), 'editor fechou ao clicar Cancelar');
    }
    await page.screenshot({ path: shots('nf5-ptz-after-close.png') });
  }

  // Limpeza
  await page.evaluate(async (ids) => { if (ids.cam) await window.svl.cameras.remove(ids.cam); if (ids.ptz) await window.svl.cameras.remove(ids.ptz); }, { cam: camId, ptz: ptzCamId });
  await app.close();
})().catch((err) => { console.error('ERRO NO TESTE:', err); process.exit(1); });
