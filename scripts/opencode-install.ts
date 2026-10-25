// Instalador do plugin do Habblaud para o opencode (<opencode-config>/plugins/habblaud.ts)
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PLUGIN = join(ROOT, 'mod', 'habblaud-opencode', 'plugin.ts');

function opencodeConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, 'opencode');
  return join(homedir(), '.config', 'opencode');
}

const targetPlugin = join(opencodeConfigDir(), 'plugins', 'habblaud.ts');
const cmd = process.argv[2] || 'status';

if (cmd === 'install') {
  mkdirSync(dirname(targetPlugin), { recursive: true });
  copyFileSync(SOURCE_PLUGIN, targetPlugin);
  console.log(`✓ Plugin do Habblaud para opencode instalado em ${targetPlugin}`);
} else if (cmd === 'uninstall') {
  if (existsSync(targetPlugin)) {
    unlinkSync(targetPlugin);
    console.log(`✓ Plugin do Habblaud para opencode removido de ${targetPlugin}`);
  } else {
    console.log(`• Plugin do opencode não estava instalado.`);
  }
} else {
  const installed = existsSync(targetPlugin);
  console.log(`• opencode (${targetPlugin}): ${installed ? 'instalado' : 'não instalado'}`);
}
