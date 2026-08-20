// Two participants in one room, walking the multi-party scenarios from
// specs/screen-sharing end to end.
//
// Bugs found by this script that a single instance CANNOT surface: the roster
// only listing people who joined after you, and the sharer not being marked as
// sharing. Both looked fine with one participant.
//
// The single-instance lock is keyed on userData, so each app gets its own
// --user-data-dir — including the first, or an installed Nigord sitting in the
// tray blocks the run. Both use Chromium's fake media devices; under Xvfb there is
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
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Windows has no xvfb: the app launches onto the real desktop, which is also
// why the capture picker there lists real screens instead of a single window.
const WINDOWS = process.platform === 'win32';
const TMP = tmpdir();

const APP_DIR = resolve(import.meta.dirname, '../../..');
const REPO = resolve(APP_DIR, '../..');
const store = join(REPO, 'node_modules/.pnpm');
const electron = join(
  store,
  readdirSync(store)
    .filter((e) => /^electron@\d/.test(e))
    .sort()
    .reverse()[0],
  WINDOWS ? 'node_modules/electron/dist/electron.exe' : 'node_modules/electron/dist/electron',
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(port, userDataDir) {
  const appArgs = [
    APP_DIR,
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ];
  if (userDataDir) appArgs.push(`--user-data-dir=${userDataDir}`);
  if (WINDOWS) {
    // detached so the window is not tied to this console; the tree is killed
    // through taskkill, since Windows has no process groups to signal.
    return spawn(electron, appArgs, { cwd: REPO, detached: true, stdio: 'ignore' });
  }
  const args = ['-a', '--server-args=-screen 0 1280x800x24', electron, ...appArgs];
  return spawn('xvfb-run', args, { cwd: REPO, detached: true, stdio: 'ignore' });
}

/** Killing the wrapper leaves Electron alive, and a survivor holds the
 * single-instance lock that makes the next run exit instantly. */
function kill(child) {
  try {
    if (WINDOWS)
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
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

/**
 * A sala do teste é dedicada, e não a que o formulário oferece por padrão.
 *
 * O padrão é `sala-principal` — onde o grupo realmente conversa. Um roteiro que
 * a usa despeja dois participantes e uma tela compartilhada no meio da conversa
 * de outras pessoas, o que já aconteceu.
 */
const SALA_DE_TESTE = 'sala-de-teste-automatizado';

const joinAs = async (evaluate, name) => {
  await evaluate(`
    (() => {
      const inputs = [...document.querySelectorAll('.join input')];
      if (inputs.length < 2) return 'JA_NA_SALA';
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(inputs[0], ${JSON.stringify(name)});
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      set.call(inputs[1], ${JSON.stringify(SALA_DE_TESTE)});
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
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
  // Ambos com perfil próprio, e não só o segundo: com o userData padrão, um
  // Nigord instalado e aberto — inclusive minimizado na bandeja — segura o
  // bloqueio de instância única e este roteiro morre sem chegar a rodar.
  procs.push(launch(9500, join(TMP, 'nigord-participante-a')));
  procs.push(launch(9501, join(TMP, 'nigord-participante-b')));

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
    // Under Xvfb the only capturable source is the app's own window; on Windows
    // the real screens are listed. Either way the list is not populated the
    // instant the picker opens.
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

  /**
   * O áudio remoto, que a versão anterior deste roteiro nunca olhou — e foi
   * assim que dez cenários passaram numa sala completamente muda.
   *
   * Os elementos ficam num contêiner conhecido justamente para poderem ser
   * medidos: `readyState > 0` e `!paused` separam "existe" de "está tocando".
   */
  const audio = (who) =>
    who.evaluate(`
      (() => {
        const els = [...document.querySelectorAll('#nigord-audio audio')];
        return {
          elementos: els.length,
          tocando: els.filter((a) => !a.paused && a.readyState > 0).length,
        };
      })()`);

  const results = [];
  const check = (name, passed, detail) => {
    results.push({ name, passed });
    console.log(`  ${passed ? 'PASSOU' : 'FALHOU'} — ${name}${detail ? `: ${detail}` : ''}`);
  };

  console.log('\n[presença] quem já estava na sala aparece para quem chega depois');
  const rosterB = await roster(b);
  check('B vê A, que entrou antes', String(rosterB).includes('trxlezi'), JSON.stringify(rosterB));

  console.log('\n[voz] o áudio remoto realmente toca');
  const audioB = await audio(b);
  check(
    'B está reproduzindo a voz de A',
    typeof audioB === 'object' && audioB.tocando > 0,
    JSON.stringify(audioB),
  );
  const audioA = await audio(a);
  check(
    'A está reproduzindo a voz de B',
    typeof audioA === 'object' && audioA.tocando > 0,
    JSON.stringify(audioA),
  );

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

  // Sem simulcast existe UMA codificação, e ela é a que todos recebem — é a
  // decisão do projeto, então é isso que se afirma. Duas ou mais camadas aqui
  // significariam que o simulcast voltou por algum padrão do SDK, e com ele
  // volta a escolha por espectador que esta mudança removeu.
  const camadas = await a.evaluate(`JSON.stringify(window.__nigordEncodings ?? [])`);
  const publicadas = JSON.parse(String(camadas));
  check(
    'A publica uma codificação só, ativa',
    publicadas.length === 1 && publicadas[0]?.ativa === true,
    String(camadas),
  );
  check(
    'a codificação carrega o que foi escolhido',
    publicadas[0]?.fps === 60 && publicadas[0]?.bitrate === 4000000,
    String(camadas),
  );
  console.log('    resolução entregue a B:', JSON.stringify(v));

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

  const shotDir = process.env.SCREENSHOT_DIR || join(TMP, 'nigord-shots');
  mkdirSync(shotDir, { recursive: true });
  const file = join(shotDir, 'dois-participantes.png');
  const shot = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log('\nscreenshot de quem assiste:', file);

  const falhas = results.filter((r) => !r.passed);
  console.log(`\n${results.length - falhas.length}/${results.length} cenários passaram`);
  failed = falhas.length > 0;
} finally {
  for (const p of procs) kill(p);
}
process.exit(failed ? 1 : 0);
