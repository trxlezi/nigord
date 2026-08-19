---
name: run-desktop
description: Build, run, screenshot and drive the Nigord Electron desktop app on Linux or Windows. Use when asked to start the desktop app, take a screenshot of the UI, click through it, exercise its IPC/bridge surface, or confirm a change works in the real app rather than only in tests.
---

Nigord is an Electron app (main + preload + React renderer). Drive it with the
CDP driver at `.claude/skills/run-desktop/driver.mjs`: it speaks the Chrome
DevTools Protocol over Node's built-in `fetch` and `WebSocket`, and needs no
extra dependencies — `playwright-core` is not installed
here and neither is `tmux`.

**All paths below are relative to `apps/desktop/`.**

The driver is **batch**: each run launches the app, executes your commands, and
kills it. This is deliberate — the DevTools endpoint accepts only one debugger
connection per page, so a long-lived driver (or a stray background client) locks
out every later run.

## Prerequisites

**Linux:** `xvfb-run` is required and already present at `/usr/bin/xvfb-run`.
The driver launches the app under it.

**Windows:** nothing extra. The driver detects `win32`, skips `xvfb-run`, runs
`dist/electron.exe` on the real desktop, and kills the tree with
`taskkill /T /F` — Windows has no process group to signal. Screenshots go to
`%TEMP%\nigord-shots` instead of `/tmp`. Two differences follow from having a
real desktop: the capture picker lists real screens rather than the app's own
window, and the fake media devices stay opt-in (`FAKE_MEDIA=1`), since there is
a real microphone.

The Electron binary is the one real trap. `pnpm dev:desktop` fails with
`Error: Electron uninstall` because pnpm skipped Electron's install script, and
**`pnpm rebuild electron` does not fix it**. Fetch the binary directly (~100MB):

```bash
(cd ../../node_modules/.pnpm/electron@33.4.11/node_modules/electron && node install.js)
```

`33.4.11` is the _resolved_ version, not the `^33.3.0` range in `package.json`,
so it changes on upgrade — the driver discovers the real directory and prints the
exact command when the binary is missing. Take it from there rather than
guessing.

## Build

The driver runs the built output, not the dev server:

```bash
pnpm -C apps/desktop build
```

Rebuild after every source change — the driver will happily run a stale bundle.

## Run (agent path)

Commands come from argv, or from stdin one per line (`#` comments allowed):

```bash
cd apps/desktop
node .claude/skills/run-desktop/driver.mjs 'ss entrada' 'text'
```

```bash
node .claude/skills/run-desktop/driver.mjs <<'EOF'
invoke capture:capabilities
fill .join input | trxlezi
submit form
wait-text .alert
ss erro-de-rede
EOF
```

Screenshots land in `/tmp/nigord-shots/` (`%TEMP%\nigord-shots` on Windows) (override with `SCREENSHOT_DIR`).
**Open the PNG and look at it** — a blank frame means the launch failed.

Exit code is 1 if any command reported `NOT_FOUND`, `TIMEOUT` or `ERROR`, so it
is safe to chain in a check.

### Commands

| command                   | what it does                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| `ss [name]`               | screenshot → `/tmp/nigord-shots/<name>.png`                          |
| `text [css]`              | print `innerText` of a selector, or of the whole body                |
| `eval <js>`               | evaluate in the renderer, print the JSON result                      |
| `invoke <channel> [json]` | call the preload bridge, e.g. `invoke prefs:set {"micMode":"muted"}` |
| `click <css>`             | DOM click (not coordinates — cannot miss)                            |
| `click-text <text>`       | click the button/link/label with this text                           |
| `fill <css> \| <value>`   | set a React-controlled input (**the pipe is required**)              |
| `submit [css]`            | `requestSubmit()` on a form, so React's `onSubmit` runs              |
| `wait <css>`              | wait up to 15s for an element                                        |
| `wait-text <css>`         | wait up to 15s for an element to have text                           |
| `press <key>`             | dispatch a key event                                                 |
| `sleep <ms>`              | pause                                                                |
| `help`                    | list commands                                                        |

`invoke` is the highest-value command here: the bridge is the app's entire
platform surface, so capture, hotkeys and preferences can all be exercised
without ever joining a room.

### Reaching the failure paths

The entry screen distinguishes three failures, and all three are reachable
locally. With no token server running you get the network one. For the other
two, start a token server with throwaway credentials (no real keys needed — the
LiveKit URL never has to resolve):

```bash
LIVEKIT_URL="wss://exemplo-local.invalid" \
LIVEKIT_API_KEY="chave-de-teste-local" \
LIVEKIT_API_SECRET="segredo-de-teste-local-suficientemente-longo" \
NIGORD_GROUP_SECRET="segredo-do-grupo-teste" \
pnpm -s dev:server &
```

Then point the app at it, with the right or the wrong secret:

```bash
NIGORD_TOKEN_SERVER=http://127.0.0.1:3000 NIGORD_GROUP_SECRET=segredo-errado \
  node .claude/skills/run-desktop/driver.mjs 'fill .join input | trxlezi' 'submit form' 'wait-text .alert'
```

| setup                               | expected alert                          |
| ----------------------------------- | --------------------------------------- |
| no token server                     | `Não foi possível alcançar o servidor.` |
| wrong `NIGORD_GROUP_SECRET`         | `A credencial do grupo foi recusada.`   |
| correct secret, unreachable LiveKit | `A conexão com a sala falhou.`          |

### Two participants (`two-participants.mjs`)

A call has more than one person in it, and some bugs only exist there. This
script launches two apps into the same room, shares a screen from one, and
measures the video on the other:

```bash
PORT=3300 pnpm --filter @nigord/token-server start   # needs .env at the repo root

NIGORD_TOKEN_SERVER=http://127.0.0.1:3300 NIGORD_GROUP_SECRET=<segredo>   node .claude/skills/run-desktop/two-participants.mjs
```

It runs on Windows too, with the same command. Kill any app started by
`pnpm dev:desktop` first: participant A uses the default userData directory, so
a running dev instance holds the single-instance lock and A exits immediately.
Ten of ten scenarios passed there on 19/08/2026, video arriving at 960×540.

It walks ten checks across the multi-party scenarios in `specs/screen-sharing` —
presence, media actually arriving, simultaneous shares, expanded view, a share
ending, a participant leaving — printing `PASSOU`/`FALHOU` per check and exiting
non-zero if any failed.

The media check is the one that matters: it reads the receiving side's
`videoWidth`. A tab can be listed with the video frozen at zero, so the
dimensions are the only honest proof that the stream arrived.

Two bugs came out of this that a single instance could never show: the roster
only listing people who joined _after_ you, and the sharer being the one person
who could not see that they were sharing.

Beyond this, a full session (six people, real networks, NAT traversal) still
needs real machines.

## Run (human path)

`pnpm dev:desktop` opens a real window with hot reload. It needs the Electron
binary from Prerequisites, and it is useless headless.

## Test

```bash
pnpm -w test          # 87 tests, all packages
pnpm -w check         # lint + typecheck + tests
```

## Gotchas

- **`pnpm rebuild electron` is a no-op here.** It prints nothing and fixes
  nothing. Only `node install.js` inside the electron package works.
- **Node resolves `localhost` to `::1`; the DevTools endpoint is IPv4-only.**
  Using `localhost` makes `fetch` hang until timeout with no error. The driver
  always uses `127.0.0.1`.
- **One debugger connection per page.** A driver process left alive in the
  background holds it, and every later run then hangs at connect. If that
  happens, kill the stray Node process.
- **Killing `xvfb-run` does not kill Electron.** The survivor then makes the
  next launch exit _instantly_ through the single-instance lock (task 6.5),
  which looks like a launch failure but is the app working correctly. The driver
  spawns detached and kills the whole process group.
- **On Windows, `Stop-Process -Name electron` is the blunt cleanup** when a run
  leaves survivors; the driver's own `taskkill /T` handles the normal path.
- **`pkill -f <pattern>` kills the agent's own shell**, because the pattern
  appears in the shell's command line. Filter `ps -eo pid,args` instead.
- **The page target exists before React mounts.** Commands issued too early get
  `NOT_FOUND` for elements that appear moments later. The driver waits for
  `#root` to have a child.
- **`.value = x` does not work on the inputs.** React tracks its own value on
  the node; `fill` goes through the native setter plus an `input` event.
- **Only one capture source appears under Xvfb** — the app's own window, with an
  empty name. Not a bug in the picker; there is nothing else on that display.
- **PipeWire and GPU noise on stderr is normal** (`viz_main_impl`,
  `pw_thread_loop_wait`). The driver filters it and prints only real errors.

## Troubleshooting

- **`Electron binary missing`** → run the `node install.js` line from
  Prerequisites.
- **`Build output missing`** → `pnpm -C apps/desktop build`.
- **`App never exposed a page target`** → almost always a leftover Electron
  process holding the single-instance lock. Find and kill it via
  `ps -eo pid,args`.
- **Driver hangs before `launched:`** → a stray driver process holds the
  debugger connection.
- **Commands all return `NOT_FOUND`** → stale bundle; rebuild.
