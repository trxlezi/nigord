// Two participants in one room — the only way to test what a call actually is.
//
// Bugs found by this script that a single instance CANNOT surface: the roster
// only listing people who joined after you, and the sharer not being marked as
// sharing. Both looked fine with one participant.
//
// The single-instance lock is keyed on userData, so the second app gets its own
// --user-data-dir. Both use Chromium's fake media devices; under Xvfb there is
// no camera, microphone or screen content otherwise.
//
// Needs a reachable token server:
//   PORT=3300 pnpm --filter @nigord/token-server start   # needs .env
//   NIGORD_TOKEN_SERVER=http://127.0.0.1:3300 \
//   NIGORD_GROUP_SECRET=<segredo> \
//     node .claude/skills/run-desktop/two-participants.mjs
//
// It prints each step and ends with the video dimensions on the receiving side.
// Zeros there mean the media never arrived, whatever the UI claims.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP_DIR = resolve(import.meta.dirname, '../../..');
const REPO = resolve(APP_DIR, '../..');
const store = join(REPO, 'node_modules/.pnpm');
const electron = join(
  store,
  readdirSync(store).filter((e) => /^electron@\d/.test(e)).sort().reverse()[0],
  'node_modules/electron/dist/electron',
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(port, userDataDir) {
  const args = [
    '-a', '--server-args=-screen 0 1280x800x24',
    electron, APP_DIR, '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ];
  if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
  return spawn('xvfb-run', args, { cwd: REPO, detached: true, stdio: 'ignore' });
}

async function connect(port) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        const pending = new Map();
        let id = 0;
        ws.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        });
        await new Promise((r) => ws.addEventListener('open', r));
        const send = (method, params = {}) => new Promise((res) => {
          const n = ++id; pending.set(n, res);
          ws.send(JSON.stringify({ id: n, method, params }));
        });
        const evaluate = async (expression) => {
          const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          return r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null;
        };
        // Wait for React.
        for (let i = 0; i < 60; i++) {
          if (await evaluate("!!document.querySelector('#root')?.firstElementChild")) break;
          await sleep(300);
        }
        return { send, evaluate };
      }
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`no page target on ${port}`);
}

const joinAs = async (evaluate, name) => {
  await evaluate(`
    (() => {
      const el = document.querySelector('.join input');
      if (!el) return 'JA_NA_SALA';
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(name)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('form').requestSubmit();
      return 'ok';
    })()
  `);
  for (let i = 0; i < 60; i++) {
    if (await evaluate("!!document.querySelector('.controls')")) return true;
    await sleep(500);
  }
  return false;
};

const procs = [];
try {
  procs.push(launch(9500, null));
  procs.push(launch(9501, '/tmp/nigord-participante-b'));

  const a = await connect(9500);
  const b = await connect(9501);
  console.log('duas instâncias no ar');

  console.log('A entrou:', await joinAs(a.evaluate, 'trxlezi'));
  console.log('B entrou:', await joinAs(b.evaluate, 'amigo'));
  await sleep(3000);

  console.log('roster de A:', JSON.stringify(await a.evaluate("document.querySelector('.roster')?.innerText")));
  console.log('roster de B:', JSON.stringify(await b.evaluate("document.querySelector('.roster')?.innerText")));

  // A shares its screen. Every step is asserted: a positional selector that
  // silently misses would look exactly like a broken app.
  const clickText = (text) => `
    (() => {
      const els = [...document.querySelectorAll('button')];
      const el = els.find(e => e.textContent?.trim() === ${JSON.stringify(text)})
              ?? els.find(e => e.textContent?.includes(${JSON.stringify(text)}));
      if (!el) return 'NAO_ACHOU';
      if (el.disabled) return 'DESABILITADO';
      el.click(); return 'ok';
    })()`;

  const waitFor = async (target, selector, label, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      if (await target.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) {
        console.log(`${label}: apareceu em ~${(i * 0.4).toFixed(1)}s`);
        return true;
      }
      await sleep(400);
    }
    console.log(`${label}: TIMEOUT`);
    return false;
  };

  console.log('A clica Compartilhar tela:', await a.evaluate(clickText('Compartilhar tela')));
  await waitFor(a, '.picker', 'picker em A');
  // Each xvfb-run gets its own display, so the only capturable source is this
  // app's own window — and it is not mapped the instant the picker opens.
  // Waiting for the thumbnail, not just the dialog, is what makes this stable.
  if (!(await waitFor(a, '.thumb', 'fonte de captura'))) {
    console.log('nenhuma fonte apareceu; abortando antes de medir o que não existe');
    process.exit(1);
  }
  await a.evaluate(`document.querySelector('.thumb')?.click()`);
  await sleep(500);
  console.log('A confirma:', await a.evaluate(`
    (() => {
      const el = [...document.querySelectorAll('.picker__actions button')]
        .find(x => x.textContent.includes('Compartilhar'));
      if (!el) return 'NAO_ACHOU';
      if (el.disabled) return 'DESABILITADO';
      el.click(); return 'ok';
    })()`));
  await sleep(6000);
  console.log('controles de A:', JSON.stringify(await a.evaluate("document.querySelector('.controls')?.innerText")));
  console.log('erro de compartilhamento em A:', JSON.stringify(await a.evaluate("document.querySelector('.alert')?.innerText ?? '(nenhum)'")));
  console.log('roster de A:', JSON.stringify(await a.evaluate("document.querySelector('.roster')?.innerText")));
  console.log('esperando chegar em B...');
  await sleep(6000);

  console.log('roster de B agora:', JSON.stringify(await b.evaluate("document.querySelector('.roster')?.innerText")));
  console.log('abas de transmissão em B:', JSON.stringify(await b.evaluate("document.querySelector('.viewer__tabs')?.innerText ?? '(sem viewer)'")));

  // Watch it and measure the actual video.
  await b.evaluate(`document.querySelector('.viewer__tabs .tab')?.click()`);
  await sleep(6000);
  console.log('vídeo em B:', JSON.stringify(await b.evaluate(`
    (() => {
      const v = document.querySelector('video');
      if (!v) return 'SEM ELEMENTO DE VIDEO';
      return { largura: v.videoWidth, altura: v.videoHeight, tocando: !v.paused, tempo: v.currentTime };
    })()
  `)));

  const shot = await b.send('Page.captureScreenshot', { format: 'png' });
  const shotDir = process.env.SCREENSHOT_DIR || '/tmp/nigord-shots';
  mkdirSync(shotDir, { recursive: true });
  const file = join(shotDir, 'dois-participantes.png');
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot de quem assiste:', file);
} finally {
  for (const p of procs) { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }
}
process.exit(0);
