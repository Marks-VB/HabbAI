// Instalador do hook do Habblaud para o Antigravity (~/.gemini/config/hooks.json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SCRIPT = join(ROOT, 'mod', 'habblaud-antigravity', 'hook.mjs');
const HOOKS_FILE = join(homedir(), '.gemini', 'config', 'hooks.json');

const cmd = process.argv[2] || 'status';

function loadHooks() {
  if (!existsSync(HOOKS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(HOOKS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveHooks(h: any) {
  mkdirSync(dirname(HOOKS_FILE), { recursive: true });
  writeFileSync(HOOKS_FILE, JSON.stringify(h, null, 2) + '\n');
}

if (cmd === 'install') {
  const h = loadHooks();
  const baseCmd = `node "${HOOK_SCRIPT}"`;

  h.habblaud = {
    SessionStart: [{ type: 'command', command: `${baseCmd} --hook-event SessionStart` }],
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `${baseCmd} --hook-event PreToolUse` }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `${baseCmd} --hook-event PostToolUse` }] }],
    Stop: [{ type: 'command', command: `${baseCmd} --hook-event Stop` }],
  };

  saveHooks(h);
  console.log(`✓ Hooks do Habblaud para Antigravity instalados em ${HOOKS_FILE}`);
} else if (cmd === 'uninstall') {
  const h = loadHooks();
  if (h.habblaud) {
    delete h.habblaud;
    saveHooks(h);
  }
  console.log(`✓ Hooks do Habblaud para Antigravity removidos de ${HOOKS_FILE}`);
} else {
  const h = loadHooks();
  const installed = !!h.habblaud;
  console.log(`• Antigravity (${HOOKS_FILE}): ${installed ? 'instalado' : 'não instalado'}`);
}
