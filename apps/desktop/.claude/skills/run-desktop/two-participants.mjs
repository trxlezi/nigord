// Two participants in one room, walking the multi-party scenarios from
// specs/screen-sharing end to end.
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
  readdirSync(store)
    .filter((e) => /^electron@\d/.test(e))
    .sort()
    .reverse()[0],
  'node_modules/electron/dist/electron',
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(port, userDataDir) {
  const args = [
    '-a',
    '--server-args=-screen 0 1280x800x24',
    electron,
    APP_DIR,
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
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
          if (m.id && pending.has(m.id)) {
            pending.get(m.id)(m);
            pending.delete(m.id);
          }
        });
        await new Promise((r) => ws.addEventListener('open', r));
        const send = (method, params = {}) =>
          new Promise((res) => {
            const n = ++id;
            pending.set(n, res);
            ws.send(JSON.stringify({ id: n, method, params }));
          });
        const evaluate = async (expression) => {
          const r = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          return r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? null;
        };
        // Wait for React.
        for (let i = 0; i < 60; i++) {
          if (await evaluate("!!document.querySelector('#root')?.firstElementChild")) break;
          await sleep(300);
        }
        return { send, evaluate };
      }
    } catch {
      /* not up yet */
    }
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
let failed = false;
try {
  procs.push(launch(9500, null));
  procs.push(launch(9501, '/tmp/nigord-participante-b'));

  const a = await connect(9500);
  const b = await connect(9501);
  console.log('duas instâncias no ar');

  console.log('A entrou:', await joinAs(a.evaluate, 'trxlezi'));
  console.log('B entrou:', await joinAs(b.evaluate, 'amigo'));
  await sleep(3000);

  console.log(
    'roster de A:',
    JSON.stringify(await a.evaluate("document.querySelector('.roster')?.innerText")),
  );
  console.log(
    'roster de B:',
    JSON.stringify(await b.evaluate("document.querySelector('.roster')?.innerText")),
  );

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
      if (await target.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))
        return true;
      await sleep(400);
    }
    console.log(`  ${label}: TIMEOUT`);
    return false;
  };

  /**
   * Every step is asserted. A positional selector that silently misses looks
   * exactly like a broken app — that mistake cost an entire debugging session.
   */
  const share = async (who, label) => {
    await who.evaluate(clickText('Compartilhar tela'));
    if (!(await waitFor(who, '.picker', `picker de ${label}`))) return false;
    // Each xvfb-run gets its own display, so the only capturable source is the
    // app's own window — and it is not mapped the instant the picker opens.
    if (!(await waitFor(who, '.thumb', `fonte de ${label}`))) return false;
    await who.evaluate(`document.querySelector('.thumb')?.click()`);
    await sleep(400);
    await who.evaluate(`
      (() => {
        const el = [...document.querySelectorAll('.picker__actions button')]
          .find(x => x.textContent.includes('Compartilhar'));
        if (el && !el.disabled) el.click();
      })()`);
    await sleep(5000);
    return true;
  };

  const roster = (who) => who.evaluate("document.querySelector('.roster')?.innerText");
  const tabs = (who) =>
    who.evaluate("document.querySelector('.viewer__tabs')?.innerText ?? '(sem transmissões)'");
  const video = (who) =>
    who.evaluate(`
      (() => {
        const v = document.querySelector('video');
        return v ? { largura: v.videoWidth, altura: v.videoHeight, tocando: !v.paused } : 'sem vídeo';
      })()`);

  const results = [];
  const check = (name, passed, detail) => {
    results.push({ name, passed });
    console.log(`  ${passed ? 'PASSOU' : 'FALHOU'} — ${name}${detail ? `: ${detail}` : ''}`);
  };

  console.log('\n[presença] quem já estava na sala aparece para quem chega depois');
  const rosterB = await roster(b);
  check('B vê A, que entrou antes', String(rosterB).includes('trxlezi'), JSON.stringify(rosterB));

  console.log('\n[compartilhar] a mídia chega do outro lado');
  await share(a, 'A');
  check('A se vê compartilhando', String(await roster(a)).includes('tela'));
  const tabsB = await tabs(b);
  check('B vê a transmissão listada', String(tabsB).includes('trxlezi'), JSON.stringify(tabsB));
  await b.evaluate(`document.querySelector('.viewer__tabs .tab')?.click()`);
  await sleep(5000);
  const v = await video(b);
  // The dimensions are the only honest proof: the tab can be there with the
  // video frozen at zero.
  check('o vídeo realmente chega em B', typeof v === 'object' && v.largura > 0, JSON.stringify(v));

  console.log('\n[simultâneos] mais de uma transmissão ao mesmo tempo');
  await share(b, 'B');
  await sleep(3000);
  const tabsA = await tabs(a);
  check('A vê a transmissão de B', String(tabsA).includes('amigo'), JSON.stringify(tabsA));
  check(
    'ninguém vê a própria transmissão de volta',
    !String(await tabs(b)).includes('amigo'),
    JSON.stringify(await tabs(b)),
  );

  console.log('\n[ampliado] alternar entre ampliada e reduzida');
  await b.evaluate(clickText('Ampliar'));
  await sleep(1200);
  check('viewer amplia', await b.evaluate("!!document.querySelector('.viewer--expanded')"));
  check(
    'painel lateral sai da frente',
    await b.evaluate(
      `(() => { const s = document.querySelector('.app__side');
         return s ? getComputedStyle(s).display === 'none' : false; })()`,
    ),
  );
  await b.evaluate(clickText('Reduzir'));
  await sleep(800);

  console.log('\n[fim da transmissão] a visualização fecha nos espectadores');
  await a.evaluate(clickText('Parar de compartilhar'));
  await sleep(5000);
  check('B não vê mais a transmissão de A', !String(await tabs(b)).includes('trxlezi'));

  console.log('\n[saída] quem sai desaparece da sala');
  await a.evaluate(clickText('Sair'));
  await sleep(5000);
  check('A some do roster de B', !String(await roster(b)).includes('trxlezi'));

  const shotDir = process.env.SCREENSHOT_DIR || '/tmp/nigord-shots';
  mkdirSync(shotDir, { recursive: true });
  const file = join(shotDir, 'dois-participantes.png');
  const shot = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log('\nscreenshot de quem assiste:', file);

  const falhas = results.filter((r) => !r.passed);
  console.log(`\n${results.length - falhas.length}/${results.length} cenários passaram`);
  failed = falhas.length > 0;
} finally {
  for (const p of procs) {
    try {
      process.kill(-p.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}
process.exit(failed ? 1 : 0);
