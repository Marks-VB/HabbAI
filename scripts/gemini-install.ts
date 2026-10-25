// Instalador do hook do Habblaud para o Google Gemini CLI (~/.gemini/settings.json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_SCRIPT = join(ROOT, 'mod', 'habblaud-gemini', 'hook.mjs');
const SETTINGS_FILE = join(homedir(), '.gemini', 'settings.json');

const cmd = process.argv[2] || 'status';

function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(s: any) {
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n');
}

if (cmd === 'install') {
  const s = loadSettings();
  s.hooks = s.hooks || {};
  const hookCmd = `node "${HOOK_SCRIPT}"`;

  const events = ['BeforeTool', 'AfterTool', 'BeforeAgent', 'AfterAgent', 'SessionStart', 'SessionEnd'];
  for (const ev of events) {
    s.hooks[ev] = s.hooks[ev] || [];
    // remove handler antigo do habblaud se houver
    s.hooks[ev] = s.hooks[ev].filter((h: any) => !JSON.stringify(h).includes('habblaud-gemini'));
    s.hooks[ev].push({
      matcher: '*',
      hooks: [
        {
          name: 'habblaud',
          type: 'command',
          command: hookCmd,
        },
      ],
    });
  }

  saveSettings(s);
  console.log(`✓ Hooks do Habblaud instalados com sucesso em ${SETTINGS_FILE}`);
} else if (cmd === 'uninstall') {
  const s = loadSettings();
  if (s.hooks) {
    for (const k of Object.keys(s.hooks)) {
      if (Array.isArray(s.hooks[k])) {
        s.hooks[k] = s.hooks[k].filter((h: any) => !JSON.stringify(h).includes('habblaud-gemini'));
        if (s.hooks[k].length === 0) delete s.hooks[k];
      }
    }
    saveSettings(s);
  }
  console.log(`✓ Hooks do Habblaud removidos de ${SETTINGS_FILE}`);
} else {
  const s = loadSettings();
  const installed = s.hooks && JSON.stringify(s.hooks).includes('habblaud-gemini');
  console.log(`• Gemini CLI (${SETTINGS_FILE}): ${installed ? 'instalado' : 'não instalado'}`);
}
