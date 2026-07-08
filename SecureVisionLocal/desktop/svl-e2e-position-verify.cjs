/* Teste completo: verificação de posição, auto-detect, edição de ponto na rota */
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

  // =========================================================
  // 1. CRIAR CÂMERA PTZ
  // =========================================================
  const camId = await page.evaluate(async () => (await window.svl.cameras.add({
    name: 'TestPTZ', ip: '192.0.2.100', port: 554, protocol: 'rtsp',
    streamUrl: 'rtsp://192.0.2.100:554/test', hasPTZ: true, hasAudio: false, recordContinuous: false,
  })).id);
  ok(!!camId, `câmera PTZ criada (${camId})`);

  // =========================================================
  // 2. CRIAR PRESETS VIA SEED
  // =========================================================
  const electronExe = join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  const presetIds = [];
  for (let i = 1; i <= 3; i++) {
    const pid = randomId();
    execFileSync(electronExe, [join(__dirname, 'svl-e2e-seed-ptz.cjs'), userData, camId, pid], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
    });
    presetIds.push(pid);
  }
  ok(presetIds.length === 3, `3 presets inseridos (${presetIds.join(', ')})`);

  // =========================================================
  // 3. VERIFICAR PRESETS VIA IPC
  // =========================================================
  const presets = await page.evaluate(async (cid) => window.svl.ptz.listPresets(cid), camId);
  ok(presets.length >= 3, `presets carregados (${presets.length})`);
  ok(presets[0].name === 'Preset 1', `nome do preset: "${presets[0].name}"`);

  // =========================================================
  // 4. EDITAR UM PRESET (renomear)
  // =========================================================
  const edited = await page.evaluate(async ({ pid, name }) => window.svl.ptz.updatePreset(pid, name), { pid: presetIds[0], name: 'Preset Editado' });
  ok(!!edited, 'updatePreset retornou resultado');
  ok(edited.name === 'Preset Editado', `preset renomeado para "${edited.name}"`);
  ok(edited.id === presetIds[0], 'id do preset preservado após edição');

  const presetsAfterEdit = await page.evaluate(async (cid) => window.svl.ptz.listPresets(cid), camId);
  const renamed = presetsAfterEdit.find((p) => p.id === presetIds[0]);
  ok(renamed?.name === 'Preset Editado', `nome confirmado no banco: "${renamed?.name}"`);

  // =========================================================
  // 5. CRIAR ROTA (TOUR) COM OS PRESETS
  // =========================================================
  const tourSteps = presetsAfterEdit.map((p) => ({
    presetToken: p.token,
    presetName: p.name,
    dwellSeconds: 5,
  }));
  const tour = await page.evaluate(async ({ cid, steps }) => {
    return window.svl.ptz.createTour(cid, 'Rota Teste', steps);
  }, { cid: camId, steps: tourSteps });
  ok(!!tour, 'rota criada');
  ok(tour.name === 'Rota Teste', `nome da rota: "${tour.name}"`);
  ok(tour.steps.length === 3, `rota com ${tour.steps.length} passos`);

  // Verificar que o preset editado aparece na rota
  const stepNames = tour.steps.map((s) => s.presetName);
  ok(stepNames.includes('Preset Editado'), 'preset editado incluso na rota');

  // =========================================================
  // 6. INICIAR/PARAR ROTA
  // =========================================================
  const started = await page.evaluate(async (tid) => window.svl.ptz.startTour(tid), tour.id);
  ok(started, 'rota iniciou');

  const statusRunning = await page.evaluate(async (cid) => window.svl.ptz.tourStatus(cid), camId);
  ok(statusRunning.running, 'status: rota em execução');
  ok(statusRunning.tourId === tour.id, 'tourId corresponde');

  await page.evaluate(async (cid) => window.svl.ptz.stopTour(cid), camId);
  const statusStopped = await page.evaluate(async (cid) => window.svl.ptz.tourStatus(cid), camId);
  ok(!statusStopped.running, 'rota parou');

  // =========================================================
  // 7. VERIFICAR POSIÇÕES (IPC)
  // =========================================================
  const results = await page.evaluate(async (cid) => window.svl.ptz.verifyPositions(cid), camId);
  ok(Array.isArray(results), 'verifyPositions retornou array');
  if (results.length > 0) {
    results.forEach((r, i) => {
      console.log(`  posição ${i}: "${r.presetName}" ok=${r.ok} score=${r.score} corrected=${r.corrected}`);
    });
  }

  // =========================================================
  // 8. AUTO-DETECT FEATURES (detectFeatures)
  // =========================================================
  // detectFeatures precisa de snapshot real; sem snapshot retorna array vazio
  for (const pid of presetIds) {
    const features = await page.evaluate(async (id) => window.svl.ptz.detectFeatures(id), pid);
    ok(Array.isArray(features), `detectFeatures("${pid}") retornou array`);
    console.log(`  detectFeatures(${pid}): ${features.length} features`);
  }

  // =========================================================
  // 9. REFERENCE MARKS - SALVAR E CARREGAR
  // =========================================================
  const marks = [
    {
      type: 'line',
      points: [{ x: 0.3, y: 0.4 }, { x: 0.7, y: 0.6 }],
      expectedDistanceLeft: 38,
      expectedDistanceTop: 51,
      tolerance: 10,
    },
    {
      type: 'zone',
      points: [
        { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.2 },
        { x: 0.3, y: 0.3 }, { x: 0.2, y: 0.3 },
      ],
      expectedDistanceLeft: 26,
      expectedDistanceTop: 26,
      tolerance: 8,
    },
  ];

  const savedMarks = await page.evaluate(
    async ({ pid, marks }) => window.svl.ptz.saveReferenceMarks(pid, marks),
    { pid: presetIds[0], marks },
  );
  ok(Array.isArray(savedMarks) && savedMarks.length === 2, 'reference marks salvas');

  const loadedMarks = await page.evaluate(async (pid) => window.svl.ptz.getReferenceMarks(pid), presetIds[0]);
  ok(loadedMarks.length === 2, 'reference marks carregadas');
  ok(loadedMarks[0].type === 'line', `tipo: "${loadedMarks[0].type}"`);
  ok(loadedMarks[1].type === 'zone', `tipo: "${loadedMarks[1].type}"`);

  // =========================================================
  // 10. VERIFICAR QUE PRESETS COM SNAPSHOT APARECEM NA UI
  // =========================================================
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 20000 });
  await page.waitForSelector('.grid-cell', { timeout: 10000 });
  await page.waitForTimeout(400);

  const rotaBtn = await page.$('.grid-cell .btn:has-text("Rota")');
  ok(!!rotaBtn, 'botão Rota visível na grid');
  if (!rotaBtn) { await app.close(); return; }
  await rotaBtn.click();
  await page.waitForTimeout(1000);

  ok(!!(await page.$('.tour-modal .preset-item')), 'presets na UI do modal Rota');
  await page.screenshot({ path: shots('pv1-tour-modal.png') });

  // Verificar botões: Ir, + rota, Marcas, Editar, Salvar posição, ✕
  const presetBtns = await page.$$('.tour-modal .preset-item:first-child .preset-btns button');
  ok(presetBtns.length === 6, `6 botões por preset (Ir, + rota, Marcas, Editar, Salvar posição, ✕) — tem ${presetBtns.length}`);

  // Clicar em Editar no primeiro preset
  const editBtn = await page.$('.tour-modal .preset-item:first-child .preset-btns button:nth-child(4)');
  ok(!!editBtn, 'botão Editar');
  if (editBtn) {
    const editText = await editBtn.textContent();
    ok(editText.trim() === 'Editar', `texto: "${editText.trim()}"`);
    await editBtn.click();
    await page.waitForTimeout(300);

    // Form de edição deve aparecer
    ok(!!(await page.$('.tour-modal .preset-edit')), 'form de edição abriu');
    ok(!!(await page.$('.tour-modal .preset-edit input')), 'input de edição visível');
    ok(!!(await page.$('.tour-modal .preset-edit .btn:has-text("Salvar")')), 'botão Salvar');
    ok(!!(await page.$('.tour-modal .preset-edit .btn:has-text("Cancelar")')), 'botão Cancelar');

    // Clicar Cancelar
    await page.click('.tour-modal .preset-edit .btn:has-text("Cancelar")');
    await page.waitForTimeout(200);
    ok(!(await page.$('.tour-modal .preset-edit')), 'edição cancelada');
  }

  // Verificar botão Salvar posição
  const salvarPosBtn = await page.$('.tour-modal .preset-item:first-child .preset-btns button:nth-child(5)');
  ok(!!salvarPosBtn, 'botão Salvar posição');
  if (salvarPosBtn) {
    const salvarText = await salvarPosBtn.textContent();
    ok(salvarText.trim() === 'Salvar posição', `texto: "${salvarText.trim()}"`);
  }

  await page.screenshot({ path: shots('pv2-edit-preset.png') });

  // Fechar modal
  await page.click('.tour-modal .modal-actions .btn');
  await page.waitForTimeout(400);

  // =========================================================
  // 11. LIMPEZA
  // =========================================================
  for (const tid of [tour.id]) {
    await page.evaluate(async (id) => window.svl.ptz.deleteTour(id), tid);
  }
  await page.evaluate(async (id) => window.svl.cameras.remove(id), camId);
  ok(true, 'limpeza concluída');

  await app.close();
  console.log('\n=== TODOS OS TESTES CONCLUÍDOS ===');
})().catch((err) => { console.error('ERRO NO TESTE:', err); process.exit(1); });
