/* Teste dirigido do app Electron (build de produção):
 *  1. abre o app e confere que a UI carrega;
 *  2. cadastra 2 câmeras de teste e insere 2 gravações fake (pessoa / movimento);
 *  3. valida os badges de detecção na tela Gravações;
 *  4. valida o drag-and-drop da grade (troca persistida em cameraOrder);
 *  5. valida a paginação da grade (layout 1x1 com 2 câmeras);
 *  6. limpa tudo o que criou.
 * Uso: node svl-e2e-check.cjs  (a partir de desktop/)
 */
const { _electron } = require('playwright-core');
const { join } = require('node:path');

const SHOT_DIR = process.env.SHOT_DIR || __dirname;
const shots = (n) => join(SHOT_DIR, n);

function ok(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  // Diretório de dados ISOLADO: não toca no banco da instalação real e evita a
  // trava de instância única do app que estiver rodando na bandeja.
  const userData = join(SHOT_DIR, 'svl-test-data');
  require('node:fs').rmSync(userData, { recursive: true, force: true }); // estado limpo
  const app = await _electron.launch({
    args: ['.'],
    cwd: __dirname,
    env: { ...process.env, SVL_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.sidebar', { timeout: 20000 });
  ok(true, 'app abriu e a UI carregou (.sidebar presente)');

  // ---- Seed: 2 câmeras de teste (via IPC real do app) ----
  const camIds = await page.evaluate(async () => {
    const mk = (n) =>
      window.svl.cameras.add({
        name: `TesteCam ${n}`,
        ip: `192.0.2.${n}`,
        port: 554,
        protocol: 'rtsp',
        streamUrl: `rtsp://192.0.2.${n}:554/test`,
        hasPTZ: false,
        hasAudio: false,
        recordContinuous: false,
      });
    const a = await mk(1);
    const b = await mk(2);
    return [a.id, b.id];
  });
  ok(camIds.length === 2, `câmeras de teste criadas (${camIds.join(', ')})`);

  // ---- Seed: gravações fake com detectionType (processo separado, mesma ABI) ----
  const { execFileSync } = require('node:child_process');
  const electronExe = join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  execFileSync(electronExe, [join(__dirname, 'svl-e2e-seed.cjs'), userData, camIds[0], camIds[1]], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  });
  const recIds = ['rec_teste_p1', 'rec_teste_m1'];
  ok(true, 'gravações fake inseridas (person / motion)');

  // Recarrega a UI para o store reler câmeras/gravações.
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 20000 });

  // ---- Grade: células arrastáveis ----
  await page.waitForSelector('.grid-cell', { timeout: 15000 });
  const cells = await page.$$('.grid-cell[draggable="true"]');
  ok(cells.length >= 2, `grade renderiza células arrastáveis (${cells.length})`);
  await page.screenshot({ path: shots('01-live-grid.png') });

  const orderBefore = await page.evaluate(async () => (await window.svl.settings.get()).cameraOrder);

  // Drag-and-drop: primeira célula sobre a segunda (HTML5 DnD via mouse).
  const a = cells[0];
  const b = cells[1];
  const ba = await a.boundingBox();
  const bb = await b.boundingBox();
  await page.mouse.move(ba.x + ba.width / 2, ba.y + 20);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 20, { steps: 12 });
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 24, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const orderAfter = await page.evaluate(async () => (await window.svl.settings.get()).cameraOrder);
  const swapped =
    Array.isArray(orderAfter) &&
    orderAfter.length >= 2 &&
    JSON.stringify(orderAfter) !== JSON.stringify(orderBefore);
  ok(swapped, `drag-and-drop trocou e persistiu a ordem (${JSON.stringify(orderAfter)})`);
  await page.screenshot({ path: shots('02-live-grid-swapped.png') });

  // ---- Paginação: layout 1x1 com 2 câmeras → 2 páginas ----
  await page.evaluate(async () => {
    await window.svl.settings.update({ gridLayout: 1 });
  });
  await page.reload();
  await page.waitForSelector('.grid-cell', { timeout: 15000 });
  const pagerText = await page.textContent('.grid-pager').catch(() => null);
  ok(!!pagerText && pagerText.includes('de 2'), `paginação visível ("${(pagerText || '').trim()}")`);
  await page.click('.grid-pager button:last-child');
  await page.waitForTimeout(300);
  const pagerText2 = await page.textContent('.grid-pager').catch(() => null);
  ok(!!pagerText2 && pagerText2.includes('Página 2'), `navegou para a página 2 ("${(pagerText2 || '').trim()}")`);
  await page.screenshot({ path: shots('03-grid-page2.png') });

  // ---- Gravações: badges de detecção ----
  await page.click('button.nav-item:has-text("Gravações")');
  await page.waitForSelector('.table', { timeout: 15000 });
  await page.waitForTimeout(400);
  const personBadge = await page.textContent('.badge.det-person').catch(() => null);
  const motionBadge = await page.textContent('.badge.det-motion').catch(() => null);
  ok(!!personBadge && personBadge.includes('Pessoa'), `badge de pessoa na tabela ("${personBadge}")`);
  ok(!!motionBadge && motionBadge.includes('Movimento'), `badge de movimento na tabela ("${motionBadge}")`);
  await page.screenshot({ path: shots('04-recordings-badges.png') });

  // ---- Limpeza ----
  await page.evaluate(async ({ camIds, recIds }) => {
    for (const id of recIds) await window.svl.recording.remove(id);
    for (const id of camIds) await window.svl.cameras.remove(id);
    await window.svl.settings.update({ gridLayout: 4, cameraOrder: [] });
  }, { camIds, recIds });
  const left = await page.evaluate(async () => (await window.svl.cameras.list()).filter((c) => c.name.startsWith('TesteCam')).length);
  ok(left === 0, 'limpeza concluída (câmeras de teste removidas)');

  await app.close();
})().catch((err) => {
  console.error('ERRO NO TESTE:', err);
  process.exit(1);
});
