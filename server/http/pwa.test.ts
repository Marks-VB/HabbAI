// Service worker e cache dos estáticos (server/http/static.ts): o /sw.js precisa sair como JavaScript, sem cache
// preso, com escopo na raiz; e quando ele não existe no build, o fallback de SPA não pode devolver o index.html.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { tempDir } from '../test/fixtures';
import { createRequestGuard } from './guard';
import { createStaticHandler, IMMUTABLE, REVALIDATE } from './static';

setQuiet(true);

interface Env {
  base: string;
  close: () => Promise<void>;
  cleanup: () => void;
}

/** Sobe um dist temporário com (ou sem) sw.js, com as mesmas fábricas do servidor de produção. */
async function start(withServiceWorker: boolean): Promise<Env> {
  const tmp = tempDir();
  const dist = join(tmp.dir, 'dist');
  mkdirSync(join(dist, 'bundle'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Habblaud</title>');
  writeFileSync(join(dist, 'bundle', 'x-abc123.js'), 'console.log(1)');
  if (withServiceWorker) writeFileSync(join(dist, 'sw.js'), "self.addEventListener('fetch', () => {});\n");
  const serveStatic = createStaticHandler(dist);
  const guard = createRequestGuard();
  const server = http.createServer((req, res) => {
    if (guard(req, res)) return;
    serveStatic(req, res, new URL(req.url ?? '/', 'http://x').pathname);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
    cleanup: tmp.cleanup,
  };
}

describe('/sw.js', () => {
  let env: Env;
  afterEach(async () => {
    await env.close();
    env.cleanup();
  });

  it('serve o service worker como JavaScript, revalidando e com escopo na raiz', async () => {
    env = await start(true);
    const res = await fetch(`${env.base}/sw.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(REVALIDATE);
    expect(res.headers.get('service-worker-allowed')).toBe('/');
    // Os headers de segurança do resto do site continuam valendo.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toContain('addEventListener');
  });

  it('ausente no build: 404 em texto, nunca o index.html do fallback de SPA', async () => {
    env = await start(false);
    const res = await fetch(`${env.base}/sw.js`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).not.toContain('<title>Habblaud</title>');
    // As rotas normais continuam caindo no index.html.
    const page = await fetch(`${env.base}/sala/qualquer`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Habblaud</title>');
  });

  it('/bundle/* segue immutable: o cache do service worker não muda a regra dos arquivos com hash', async () => {
    env = await start(true);
    const res = await fetch(`${env.base}/bundle/x-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
    expect(res.headers.get('service-worker-allowed')).toBeNull();
  });
});
