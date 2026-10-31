import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HabblaudMetrics } from '../metrics/habblaud';
import { AccountsService } from '../accounts/service';
import { setQuiet } from '../log';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { tempDir } from '../test/fixtures';
import { createObservabilityHandler, type ObservabilityDeps } from './observability';
import { Hub } from './sse';

setQuiet(true);

interface Env {
  base: string;
  metrics: HabblaudMetrics;
  office: Office;
  close: () => Promise<void>;
  cleanup: () => void;
}

async function start(opts: { metricsEnabled?: boolean; now?: () => number; isRemote?: (req: http.IncomingMessage) => boolean } = {}): Promise<Env> {
  const tmp = tempDir();
  const dir = join(tmp.dir, '.claude');
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  const accounts = new AccountsService({ dirs: [dir], home: tmp.dir, env: {}, onChange: () => {} });
  const startedAt = 1_000_000;
  const office = new Office({
    names: new NameStore(null),
    version: '9.9.9',
    startedAt,
    accounts: (s) => accounts.list(s),
    sources: () => [],
    accountName: () => undefined,
  });
  const metrics = new HabblaudMetrics(opts.now ?? (() => startedAt));
  const hub = new Hub(office, { throttleMs: 10, metrics });
  const observability: ObservabilityDeps = {
    metrics,
    office,
    hub,
    sources: () => [{ label: '.claude', path: '/nao-importa', sessions: 1, ok: true }],
    sourceCount: () => 5,
    version: '9.9.9',
    startedAt,
    metricsEnabled: opts.metricsEnabled,
    isRemote: opts.isRemote,
    now: opts.now ?? (() => startedAt),
  };
  const handler = createObservabilityHandler(observability);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    metrics.httpRequest(req, res, url.pathname);
    if (url.pathname === '/api/stream') {
      hub.attach(req, res);
      return;
    }
    if (handler(req, res, url)) return;
    res.statusCode = 404;
    res.end('não');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  office.addMain({ id: '.claude:1', account: '.claude', sessionId: 's1', cwd: '/p/loja', role: 'Agente principal', startedAt, status: 'working' });
  return {
    base: `http://127.0.0.1:${port}`,
    metrics,
    office,
    close: () =>
      new Promise((ok) => {
        hub.stop();
        server.closeAllConnections();
        server.close(() => ok());
      }),
    cleanup: tmp.cleanup,
  };
}

/** Espera uma condição (desconexão do SSE fecha em outro tick). */
async function until(check: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((ok) => setTimeout(ok, 20));
  }
  throw new Error('condição não chegou a tempo');
}

/** Requisição crua (o fetch não deixa trocar o cabeçalho Host). */
function raw(base: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const u = new URL(base);
  return new Promise((ok, fail) => {
    const req = http.request({ host: u.hostname, port: u.port, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => ok({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

describe('GET /healthz', () => {
  let env: Env;
  afterEach(async () => {
    await env?.close();
    env?.cleanup();
  });

  it('devolve versão, uptime e contagens, sem autenticação', async () => {
    env = await start();
    const res = await fetch(`${env.base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({
      ok: true,
      status: 'ok',
      version: '9.9.9',
      uptimeSeconds: 0,
      sources: 5,
      sessions: 1,
      sseClients: 0,
      lastEventAt: null,
      lastEventAgeSeconds: null,
      degradedSources: [],
    });
  });

  it('responde 503 e status degraded quando uma fonte falha repetidamente', async () => {
    env = await start();
    for (let i = 0; i < 2; i++) env.metrics.sourceError('claude');
    expect((await fetch(`${env.base}/healthz`)).status).toBe(200);

    env.metrics.sourceError('claude');
    const res = await fetch(`${env.base}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, status: 'degraded', degradedSources: ['claude'] });

    env.metrics.sourceOk('claude');
    expect((await fetch(`${env.base}/healthz`)).status).toBe(200);
    expect(await (await fetch(`${env.base}/healthz`)).json()).toMatchObject({ ok: true, status: 'ok', degradedSources: [] });
  });

  it('método diferente de GET: 405', async () => {
    env = await start();
    const res = await fetch(`${env.base}/healthz`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('GET /metrics', () => {
  let env: Env;
  afterEach(async () => {
    await env?.close();
    env?.cleanup();
  });

  it('expõe o texto do Prometheus com os gauges do estado vivo', async () => {
    env = await start();
    const res = await fetch(`${env.base}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).toContain('# TYPE habblaud_uptime_seconds gauge');
    expect(text).toContain('habblaud_uptime_seconds 0');
    expect(text).toContain('habblaud_sse_clients 0');
    expect(text).toContain('habblaud_sessions 1');
    expect(text).toContain('habblaud_sources 5');
    expect(text).toContain('habblaud_events_total 0');
    expect(text).toContain('habblaud_degraded 0');

    // O /metrics recém-renderizado ainda não contou a própria resposta (o contador fecha no fim dela):
    // na leitura seguinte, a anterior já aparece.
    const second = await textOf(env.base);
    expect(second).toContain('habblaud_http_requests_total{route="/metrics",status="200"} 1');

    // Toda linha de amostra tem nome (com rótulos opcionais) e um número.
    for (const line of second.split('\n').filter((l) => l && !l.startsWith('#'))) {
      expect(line).toMatch(/^[a-z_:][a-z0-9_:]*(\{[^}]*\})? -?\d+(\.\d+)?$/);
    }
  });

  it('agrupa por rota: dois agentes diferentes somam no mesmo rótulo', async () => {
    env = await start();
    await (await fetch(`${env.base}/api/agents/ana`)).text();
    await (await fetch(`${env.base}/api/agents/beto`)).text();
    const text = await (await fetch(`${env.base}/metrics`)).text();
    expect(text).toContain('habblaud_http_requests_total{route="/api/agents/:id",status="404"} 2');
    expect(text).not.toContain('ana');
    expect(text).not.toContain('beto');
  });

  it('conta clientes SSE conectados e eventos transmitidos', async () => {
    env = await start();
    const ctrl = new AbortController();
    const stream = await fetch(`${env.base}/api/stream`, { signal: ctrl.signal });
    expect(stream.status).toBe(200);
    expect(await textOf(env.base)).toContain('habblaud_sse_clients 1');
    expect(await textOf(env.base)).toContain('habblaud_events_total 1');

    ctrl.abort();
    await until(async () => (await textOf(env.base)).includes('habblaud_sse_clients 0'));
  });

  it('só é servido pelo próprio computador', async () => {
    env = await start();
    const res = await raw(env.base, '/metrics', { Host: 'habblaud.lan:8080' });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ error: expect.stringContaining('próprio computador') });
  });

  it('nunca é servido pela porta remota, nem com Host local', async () => {
    env = await start({ isRemote: (req) => req.headers['x-remote'] === '1' });
    expect((await fetch(`${env.base}/metrics`)).status).toBe(200);
    const res = await raw(env.base, '/metrics', { Host: 'localhost:3999', 'X-Remote': '1' });
    expect(res.status).toBe(403);
  });

  it('HABBLAUD_METRICS=0 desliga a rota (404) sem derrubar o /healthz', async () => {
    env = await start({ metricsEnabled: false });
    const res = await fetch(`${env.base}/metrics`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'rota desconhecida' });
    expect((await fetch(`${env.base}/healthz`)).status).toBe(200);
  });
});

async function textOf(base: string): Promise<string> {
  return (await fetch(`${base}/metrics`)).text();
}
