// Teste de fumaça E2E do Habblaud num navegador de verdade, sem framework de teste: sobe o servidor real
// (`node dist/server/index.js`) em modo demonstração, com porta livre e pasta de dados temporária, abre a página no
// Chromium do playwright-core e confere o essencial (HTTP 200, canvas desenhado, barra do topo, Ajuda e
// Configurações, nenhum erro no console). Salva uma captura em os.tmpdir() e encerra o servidor no finally.
//
// Como rodar:
//   npm run build     (antes: o teste serve dist/client e dist/server; sem eles, rode o build primeiro)
//   npm run test:e2e
//
// Em CI roda depois do build (`npm run build && npm run test:e2e`), no Ubuntu, com o Chromium instalado pelo
// `npx playwright-core install --with-deps chromium-headless-shell` (ou um Chrome do sistema).
// Sem navegador encontrado, o teste é pulado com código 0 para não quebrar quem só quer rodar a suíte.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const serverEntry = join(root, 'dist', 'server', 'index.js');
const clientEntry = join(root, 'dist', 'client', 'index.html');
const HEALTH_TIMEOUT_MS = 20_000;
const PAGE_TIMEOUT_MS = 30_000;
const CANVAS_TIMEOUT_MS = 15_000;
const KILL_TIMEOUT_MS = 3_000;

/** Caminhos de navegador do sistema, por plataforma. */
function systemBrowsers(): string[] {
  if (process.platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA ?? '';
    return [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ...(localAppData ? [join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')] : []),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/** Executável do Chromium: HABBLAUD_CHROMIUM, o baixado pelo playwright-core e, por fim, o do sistema. */
function findChromium(): string | undefined {
  const fromEnv = process.env.HABBLAUD_CHROMIUM?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    // Sem o navegador baixado: segue para os do sistema.
  }
  return systemBrowsers().find((p) => existsSync(p));
}

/** Porta livre: escuta em 0, lê a porta e libera (o servidor do Habblaud não aceita HABBLAUD_PORT=0). */
function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => (port ? ok(port) : fail(new Error('não foi possível escolher uma porta livre'))));
    });
  });
}

const delay = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

/** Espera o processo terminar; devolve false no timeout. */
async function waitExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return Promise.race([
    new Promise<boolean>((ok) => child.once('exit', () => ok(true))),
    delay(ms).then(() => child.exitCode !== null),
  ]);
}

async function stopServer(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill();
  if (await waitExit(child, KILL_TIMEOUT_MS)) return;
  child.kill('SIGKILL');
  await waitExit(child, KILL_TIMEOUT_MS);
}

interface ServerLog {
  stdout: string;
  stderr: string;
}

function tail(log: string, lines = 20): string {
  return log.trim().split(/\r?\n/).slice(-lines).join('\n');
}

/** Espera o /api/health responder ok; em erro, mostra o stderr do servidor. */
async function waitForHealth(base: string, child: ChildProcess, log: ServerLog): Promise<Record<string, unknown>> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `o servidor encerrou antes de responder (código ${child.exitCode}).\n` +
          `stdout:\n${tail(log.stdout) || '(vazio)'}\nstderr:\n${tail(log.stderr) || '(vazio)'}`,
      );
    }
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        if (body.ok === true) return body;
        last = `resposta sem ok: ${JSON.stringify(body).slice(0, 200)}`;
      } else {
        last = `HTTP ${res.status}`;
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await delay(100);
  }
  throw new Error(
    `o servidor não respondeu em ${HEALTH_TIMEOUT_MS / 1000}s (${last || 'sem resposta'}).\n` +
      `stdout:\n${tail(log.stdout) || '(vazio)'}\nstderr:\n${tail(log.stderr) || '(vazio)'}`,
  );
}

interface CanvasProbe {
  ok: boolean;
  width: number;
  height: number;
  opaque: number;
  colors: number;
  reason?: string;
}

/** Lê alguns pixels do #world e diz se há desenho de verdade (não tudo transparente nem uma cor só). */
function probeCanvas(): CanvasProbe {
  const canvas = document.querySelector('#world');
  if (!(canvas instanceof HTMLCanvasElement)) {
    return { ok: false, width: 0, height: 0, opaque: 0, colors: 0, reason: 'sem <canvas id="world">' };
  }
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return { ok: false, width, height, opaque: 0, colors: 0, reason: 'canvas sem tamanho' };
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ok: false, width, height, opaque: 0, colors: 0, reason: 'sem contexto 2d' };
  const side = Math.max(8, Math.min(48, Math.floor(Math.min(width, height) / 6)));
  const spots: [number, number][] = [
    [0.5, 0.5],
    [0.25, 0.45],
    [0.75, 0.55],
    [0.5, 0.25],
    [0.5, 0.8],
  ];
  const colors = new Set<number>();
  let opaque = 0;
  for (const [fx, fy] of spots) {
    const x = Math.max(0, Math.min(width - side, Math.floor(width * fx - side / 2)));
    const y = Math.max(0, Math.min(height - side, Math.floor(height * fy - side / 2)));
    const data = ctx.getImageData(x, y, side, side).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      opaque++;
      colors.add(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0);
    }
  }
  return { ok: opaque > 0 && colors.size >= 8, width, height, opaque, colors: colors.size };
}

async function run(): Promise<void> {
  if (!existsSync(serverEntry) || !existsSync(clientEntry)) {
    throw new Error(
      `build ausente: rode "npm run build" antes do teste (faltou ${basename(serverEntry)} ou ` +
        `${basename(clientEntry)} em dist/).`,
    );
  }

  const executablePath = findChromium();
  if (!executablePath) {
    console.log('E2E pulado: nenhum navegador Chromium encontrado.');
    console.log('Instale o do playwright-core com: npx playwright-core install chromium-headless-shell');
    console.log('Ou aponte um navegador existente com: HABBLAUD_CHROMIUM=C:\\caminho\\chrome.exe');
    return;
  }
  console.log(`navegador: ${executablePath}`);

  const dataDir = mkdtempSync(join(tmpdir(), 'habblaud-e2e-'));
  const screenshotPath = join(tmpdir(), `habblaud-e2e-${process.pid}.png`);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const log: ServerLog = { stdout: '', stderr: '' };
  let child: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    child = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: {
        ...process.env,
        HABBLAUD_PORT: String(port),
        HABBLAUD_HOST: '127.0.0.1',
        HABBLAUD_DEMO: '1',
        HABBLAUD_DATA_DIR: dataDir,
        HABBLAUD_USAGE_DIR: join(dataDir, 'usage'),
        HABBLAUD_CLAUDE_DIRS: join(dataDir, 'claude'),
        HABBLAUD_WORLD: '0',
        HABBLAUD_CODEX: '0',
        HABBLAUD_UPDATE_CHECK: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // No Windows, sem shell: o caminho do node pode ter espaço e o argumento é o script.
      shell: false,
    });
    child.stdout?.on('data', (chunk: Buffer) => (log.stdout += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (log.stderr += chunk.toString()));

    const health = await waitForHealth(base, child, log);
    if (health.demo !== true) {
      throw new Error(`o servidor subiu sem o modo demonstração (HABBLAUD_DEMO=1): ${JSON.stringify(health)}`);
    }
    console.log(`servidor ok em ${base} (demonstração, dados em ${dataDir})`);

    browser = await chromium.launch({ headless: true, executablePath });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'pt-BR' });
    await context.addInitScript(() => localStorage.setItem('habblaud:locale', 'pt-BR'));
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const response = await page.goto(base, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
    if (!response) throw new Error('a página não respondeu (sem resposta HTTP)');
    if (response.status() !== 200) throw new Error(`a página respondeu HTTP ${response.status()} (esperado 200)`);
    console.log('✓ página abriu com HTTP 200');

    const world = page.locator('#world');
    await world.waitFor({ state: 'attached', timeout: 10_000 });
    const box = await world.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(`#world sem tamanho visível: ${box ? `${box.width}x${box.height}` : 'sem caixa'}`);
    }
    console.log(`✓ #world presente (${Math.round(box.width)}x${Math.round(box.height)})`);

    // O primeiro quadro pode chegar depois do load: insiste até o canvas ter desenho, com prazo.
    let probe = await page.evaluate(probeCanvas);
    const deadline = Date.now() + CANVAS_TIMEOUT_MS;
    while (!probe.ok && Date.now() < deadline) {
      await delay(100);
      probe = await page.evaluate(probeCanvas);
    }
    if (!probe.ok) {
      throw new Error(
        `o canvas #world não parece desenhado (${probe.width}x${probe.height}, ${probe.opaque} pixels opacos, ` +
          `${probe.colors} cores${probe.reason ? `, ${probe.reason}` : ''})`,
      );
    }
    console.log(`✓ canvas desenhado (${probe.opaque} pixels opacos, ${probe.colors} cores na amostra)`);

    await page.locator('.ui-topbar').waitFor({ state: 'visible', timeout: 10_000 });
    console.log('✓ barra do topo visível');

    // Ajuda pelo atalho documentado ("?").
    await page.keyboard.press('?');
    const help = page.locator('dialog.ui-help');
    await help.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('✓ Ajuda abriu com "?"');
    await page.keyboard.press('Escape');
    await help.waitFor({ state: 'hidden', timeout: 10_000 });
    console.log('✓ Ajuda fechou com Escape');

    // Configurações pelo botão da barra do topo (o popover fecha com Escape).
    const settingsBtn = page.getByRole('button', { name: 'Configurações', exact: true });
    await settingsBtn.click({ timeout: 10_000 });
    const settings = page.locator('#ui-settings');
    await settings.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('✓ Configurações abriram pelo botão do topo');
    await page.keyboard.press('Escape');
    await settings.waitFor({ state: 'hidden', timeout: 10_000 });
    console.log('✓ Configurações fecharam com Escape');

    await page.screenshot({ path: screenshotPath });
    console.log(`captura: ${screenshotPath}`);

    if (consoleErrors.length) {
      throw new Error(`erros no console (${consoleErrors.length}):\n${consoleErrors.slice(0, 10).join('\n')}`);
    }
    if (pageErrors.length) {
      throw new Error(`erros na página (${pageErrors.length}):\n${pageErrors.slice(0, 10).join('\n')}`);
    }
    console.log('✓ nenhum erro no console nem na página');
    console.log('E2E ok');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const extra = log.stderr.trim() ? `\nstderr do servidor:\n${tail(log.stderr)}` : '';
    throw new Error(`${detail}${extra}`);
  } finally {
    // Fecha o navegador antes do servidor para o fim do SSE não virar erro na página.
    await browser?.close().catch(() => undefined);
    await stopServer(child);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

try {
  await run();
} catch (err) {
  console.error(`E2E falhou: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
