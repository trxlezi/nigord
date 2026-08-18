#!/usr/bin/env node
// Driver for the Nigord Electron app. No dependencies: Node's global fetch and
// WebSocket speak the Chrome DevTools Protocol directly.
//
// Why not Playwright: playwright-core is not installed and pulling it in for
// this would add a heavy dev dependency the project does not otherwise want.
// Why not tmux: it is not installed on this machine either.
//
// Batch by design. Every run launches the app, executes the commands, and shuts
// it down. That is not just simpler than a long-lived REPL — the DevTools
// endpoint accepts only ONE debugger connection per page, so a driver that
// outlives its own process (or a stray background client) locks out every later
// run. One connection per process makes that impossible.
//
//   node .claude/skills/run-desktop/driver.mjs 'ss entrada' 'text'
//   node .claude/skills/run-desktop/driver.mjs <<'EOF'
//   invoke capture:capabilities
//   fill input:nth-of-type(1) trxlezi
//   submit form
//   wait-text .alert
//   ss erro
//   EOF

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const APP_DIR = resolve(import.meta.dirname, '../../..');
const REPO_ROOT = resolve(APP_DIR, '../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/nigord-shots';

// The binary lives in pnpm's store, not in a hoisted node_modules/electron, and
// the directory carries the RESOLVED version — which is not the range in
// package.json, so it has to be discovered rather than constructed.
const ELECTRON_DIRS = (() => {
  const store = join(REPO_ROOT, 'node_modules/.pnpm');
  if (!existsSync(store)) return [];
  return readdirSync(store)
    .filter((entry) => /^electron@\d/.test(entry))
    .sort()
    .reverse()
    .map((entry) => join(store, entry, 'node_modules/electron'));
})();

const ELECTRON_PKG =
  ELECTRON_DIRS.find((dir) => existsSync(join(dir, 'dist/electron'))) ?? ELECTRON_DIRS[0];
const ELECTRON_BIN = ELECTRON_PKG ? join(ELECTRON_PKG, 'dist/electron') : null;

// A random port per run: a previous app that outlived its wrapper would
// otherwise hold the fixed one and the launch would look like a hang.
const PORT = 9200 + Math.floor(Math.random() * 700);

let sawFailure = false;

const log = (...parts) => console.log(...parts);

/** Marks the run as failed. NOT_FOUND and TIMEOUT are results, not exceptions,
 * so without this an agent would read exit 0 and trust a run that did nothing. */
const report = (label, outcome) => {
  if (typeof outcome === 'string' && /^(NOT_FOUND|ERROR|TIMEOUT)/.test(outcome)) sawFailure = true;
  log(label, '→', outcome);
  return outcome;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assertPrerequisites() {
  if (!ELECTRON_BIN || !existsSync(ELECTRON_BIN)) {
    console.error(
      'Electron binary missing.\n' +
        'pnpm skipped its install script, and `pnpm rebuild electron` does not fix it. Run:\n' +
        `  (cd ${ELECTRON_PKG ?? '<node_modules/.pnpm/electron@*/node_modules/electron>'} && node install.js)`,
    );
    process.exit(1);
  }
  if (!existsSync(join(APP_DIR, 'out/main/index.js'))) {
    console.error('Build output missing. Run: pnpm -C apps/desktop build');
    process.exit(1);
  }
}

let child = null;

function launchApp() {
  // Detached so the whole process group can be killed later: killing xvfb-run
  // leaves the Electron processes running, and a survivor makes the next launch
  // exit instantly through the single-instance lock.
  child = spawn(
    'xvfb-run',
    [
      '-a',
      '--server-args=-screen 0 1400x900x24',
      ELECTRON_BIN,
      APP_DIR,
      '--no-sandbox',
      `--remote-debugging-port=${PORT}`,
      // Xvfb has no audio or video devices at all. Without a fake one, getUserMedia
      // fails and anything that depends on a live microphone cannot be exercised.
      ...(process.env['FAKE_MEDIA']
        ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
        : []),
      ...(process.env['ELECTRON_EXTRA_ARGS'] ?? '').split(' ').filter(Boolean),
    ],
    { cwd: REPO_ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const output = [];
  child.stdout.on('data', (d) => output.push(String(d)));
  child.stderr.on('data', (d) => output.push(String(d)));
  return output;
}

function stopApp() {
  if (!child) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
  child = null;
}

async function connect(output) {
  // 127.0.0.1, never localhost: Node resolves localhost to ::1 while the
  // DevTools endpoint listens on IPv4 only, so the fetch hangs until timeout.
  const deadline = Date.now() + 40_000;
  let target = null;
  while (Date.now() < deadline) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
      if (target) break;
    } catch {
      // Not listening yet.
    }
    await sleep(300);
  }
  if (!target) {
    console.error('App never exposed a page target. Output:\n' + output.join(''));
    stopApp();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));

  const send = (method, params = {}) =>
    new Promise((res) => {
      const n = ++id;
      pending.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  // The page target exists as soon as the window does, which is well before
  // React has mounted anything. Without this wait the first command runs against
  // an empty #root and reports NOT_FOUND for elements that do appear a moment
  // later — the most confusing possible failure.
  const ready = Date.now() + 20_000;
  while (Date.now() < ready) {
    const mounted = await evaluate(send, "!!document.querySelector('#root')?.firstElementChild");
    if (mounted === true) break;
    await sleep(200);
  }

  return { ws, send, url: target.url };
}

/** Runtime.evaluate, with promises awaited and exceptions surfaced as text. */
async function evaluate(send, expression) {
  const reply = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const details = reply.result?.exceptionDetails;
  if (details) return `ERROR: ${details.exception?.description ?? details.text}`;
  return reply.result?.result?.value ?? null;
}

/**
 * Long strings are truncated: capture sources carry base64 thumbnail data URIs
 * that run to tens of kilobytes each, and dumping those into an agent's context
 * is worse than useless.
 */
const json = (value) =>
  JSON.stringify(
    value,
    (_key, item) =>
      typeof item === 'string' && item.length > 180
        ? `${item.slice(0, 120)}…[+${item.length - 120} chars]`
        : item,
    1,
  );

function makeCommands(send) {
  const commands = {
    /** Screenshot to SHOT_DIR. Look at the file — a blank frame means failure. */
    async ss(name) {
      mkdirSync(SHOT_DIR, { recursive: true });
      const file = join(SHOT_DIR, `${name || `shot-${Date.now()}`}.png`);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      log('screenshot:', file);
    },

    async text(selector) {
      const value = await evaluate(
        send,
        `(${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'})?.innerText ?? '(não encontrado)'`,
      );
      if (value === '(não encontrado)') sawFailure = true;
      log(value);
    },

    async eval(expression) {
      log(json(await evaluate(send, expression)));
    },

    /**
     * Calls the preload bridge — the app's whole platform surface. This is the
     * fastest way to exercise capture, hotkeys and preferences without a room:
     *   invoke capture:sources
     *   invoke prefs:set {"micMode":"muted"}
     */
    async invoke(rest) {
      const [channel, ...payloadParts] = rest.split(/\s+/);
      const payload = payloadParts.join(' ') || '{}';
      const result = await evaluate(
        send,
        `window.nigord.invoke(${JSON.stringify(channel)}, ${payload})`,
      );
      if (typeof result === 'string' && result.startsWith('ERROR')) sawFailure = true;
      log(json(result));
    },

    /** DOM click, not coordinates: it cannot miss because of layout or layers. */
    async click(selector) {
      report(
        `click ${selector}`,
        await evaluate(
          send,
          `(() => { const el = document.querySelector(${JSON.stringify(selector)});
             if (!el) return 'NOT_FOUND'; el.click(); return 'OK'; })()`,
        ),
      );
    },

    async 'click-text'(text) {
      report(
        `click-text ${text}`,
        await evaluate(
          send,
          `(() => {
             const els = [...document.querySelectorAll('button, a, [role="button"], label')];
             const el = els.find(e => e.textContent?.trim() === ${JSON.stringify(text)})
                     ?? els.find(e => e.textContent?.includes(${JSON.stringify(text)}));
             if (!el) return 'NOT_FOUND'; el.click(); return 'OK: ' + el.tagName; })()`,
        ),
      );
    },

    /**
     * Sets a React-controlled input. Assigning .value directly does not work:
     * React tracks its own value on the node, so the change is ignored unless
     * the native setter is used and an input event is dispatched.
     * Usage: fill <selector> | <value>   (the pipe is required — CSS selectors
     * contain spaces, so splitting on whitespace guesses wrong)
     */
    async fill(rest) {
      const pipe = rest.indexOf('|');
      if (pipe === -1) {
        sawFailure = true;
        return log('fill needs: fill <selector> | <value>');
      }
      const selector = rest.slice(0, pipe).trim();
      const value = rest.slice(pipe + 1).trim();
      report(
        `fill ${selector}`,
        await evaluate(
          send,
          `(() => {
             const el = document.querySelector(${JSON.stringify(selector)});
             if (!el) return 'NOT_FOUND';
             const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
             Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)});
             el.dispatchEvent(new Event('input', { bubbles: true }));
             return 'OK'; })()`,
        ),
      );
    },

    /** requestSubmit, so React's onSubmit runs and validation is respected. */
    async submit(selector) {
      report(
        'submit',
        await evaluate(
          send,
          `(() => { const f = document.querySelector(${JSON.stringify(selector || 'form')});
             if (!f) return 'NOT_FOUND'; f.requestSubmit(); return 'OK'; })()`,
        ),
      );
    },

    async wait(selector) {
      for (let i = 0; i < 60; i++) {
        if (await evaluate(send, `!!document.querySelector(${JSON.stringify(selector)})`)) {
          return log('found:', selector);
        }
        await sleep(250);
      }
      sawFailure = true;
      log('TIMEOUT:', selector);
    },

    /** Waits for an element to have text — the honest signal that async landed. */
    async 'wait-text'(selector) {
      for (let i = 0; i < 60; i++) {
        const text = await evaluate(
          send,
          `document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`,
        );
        if (text) return log('text:', text);
        await sleep(250);
      }
      sawFailure = true;
      log('TIMEOUT (sem texto):', selector);
    },

    async press(key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key });
      log('press', key);
    },

    async sleep(ms) {
      await sleep(Number(ms) || 500);
    },

    help() {
      log('commands:', Object.keys(commands).join(', '));
    },
  };
  return commands;
}

async function readCommands() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (args.length > 0) return args;

  const lines = [];
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) lines.push(trimmed);
  }
  return lines;
}

// ---- main -------------------------------------------------------------------

assertPrerequisites();
const script = await readCommands();
if (script.length === 0) {
  log('nothing to do. try: launch ss help');
  process.exit(0);
}

const output = launchApp();
let failed = false;
try {
  const { ws, send, url } = await connect(output);
  log('launched:', url);
  const commands = makeCommands(send);

  for (const line of script) {
    const space = line.indexOf(' ');
    const [name, rest] =
      space === -1 ? [line, ''] : [line.slice(0, space), line.slice(space + 1).trim()];
    if (name === 'launch' || name === 'quit') continue; // implicit
    const command = commands[name];
    if (!command) {
      log('unknown command:', name, '— try: help');
      failed = true;
      continue;
    }
    try {
      await command(rest);
    } catch (error) {
      log('ERROR in', name, '→', error.message);
      failed = true;
    }
  }
  ws.close();
} finally {
  stopApp();
}

// Renderer errors are the ones that matter and they only show up here.
const noise = output.join('');
for (const line of noise.split('\n')) {
  if (
    /error|uncaught|failed/i.test(line) &&
    !/viz_main_impl|GPU|APPIMAGE|gbm|dbus|pipewire|thread-loop|pw_thread/i.test(line)
  ) {
    log('app stderr:', line.trim());
  }
}
process.exit(failed || sawFailure ? 1 : 0);
