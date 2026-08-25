/* Smoke test de boot: sobe o app com dados isolados e confere que o processo principal
 * inicializa sem erro com o novo encanamento (sink de movimento, fonte de clipe de evento).
 * Uso: node svl-smoke-boot.cjs  (a partir de desktop/) */
const { _electron } = require('playwright-core');
const { join } = require('node:path');
const { rmSync, existsSync, readFileSync } = require('node:fs');

(async () => {
  const userData = join(__dirname, 'svl-smoke-data');
  rmSync(userData, { recursive: true, force: true });
  const app = await _electron.launch({
    args: ['.'],
    cwd: __dirname,
    env: { ...process.env, SVL_USER_DATA: userData },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const title = await win.title();
  await new Promise((r) => setTimeout(r, 6000)); // deixa os managers rodarem 1 ciclo
  await app.close();

  const log = join(userData, 'logs', 'main.log');
  const text = existsSync(log) ? readFileSync(log, 'utf-8') : '';
  const fatal = text.split('\n').filter((l) => /uncaughtException|unhandledRejection|is not a function|Cannot read/.test(l));

  console.log(`janela="${title}"`);
  if (fatal.length) {
    console.error('FALHOU: erros no processo principal:\n' + fatal.join('\n'));
    process.exit(1);
  }
  console.log('OK: app inicializa e roda um ciclo dos managers sem erro no main');
  rmSync(userData, { recursive: true, force: true });
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
