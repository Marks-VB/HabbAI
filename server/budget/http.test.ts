import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BudgetResponse } from '../../shared/budget';
import { dayKeyOf } from '../../shared/daystats';
import type { AccountsService } from '../accounts/service';
import { createApiHandler, type ApiDeps } from '../http/app';
import type { Hub } from '../http/sse';
import { setQuiet } from '../log';
import type { Office } from '../model/office';
import { tempDir } from '../test/fixtures';
import { createBudgetRoutes } from './http';
import { BudgetStore } from './limits';
import { BudgetTracker, type BudgetStatsSource, type BudgetUsageDay } from './tracker';

setQuiet(true);

const T0 = Date.UTC(2026, 9, 8, 10);

class FakeStats implements BudgetStatsSource {
  readonly tz = 'UTC';
  readonly stats: BudgetUsageDay = {
    totals: { counts: { costUSD: 8, tokensIn: 1_000, tokensOut: 500 } },
    rooms: [{ id: '/p/loja', name: 'loja', counts: { costUSD: 8, tokensIn: 1_000, tokensOut: 500 } }],
    accounts: [{ id: '.claude', name: 'Conta C', counts: { costUSD: 8, tokensIn: 1_000, tokensOut: 500 } }],
  };

  today(): string {
    return dayKeyOf(T0, this.tz);
  }

  days(): { days: string[] } {
    return { days: [this.today()] };
  }

  day(): { stats: BudgetUsageDay } {
    return { stats: this.stats };
  }
}

async function start(extra: Partial<ApiDeps> = {}, dir?: string): Promise<{ base: string; close: () => Promise<void>; file: string }> {
  const store = new BudgetStore(join(dir ?? tempDir().dir, 'budget.json'));
  if (!store.save({ version: 1, limits: { day: { costUSD: 10 } } }).ok) throw new Error('limite de teste inválido');
  const tracker = new BudgetTracker({ store, stats: new FakeStats(), alertFile: null, cacheMs: 0, now: () => T0 });
  const api = createApiHandler({
    office: {} as unknown as Office,
    hub: {} as unknown as Hub,
    accounts: {} as unknown as AccountsService,
    sources: () => [],
    version: 'teste',
    inDocker: false,
    budget: createBudgetRoutes(tracker),
    ...extra,
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    api(req, res, url);
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
    file: store.file!,
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

describe('rotas de /api/budget', () => {
  it('GET devolve a configuração e o estado do orçamento', async () => {
    const tmp = tempDir();
    const env = await start({}, tmp.dir);
    try {
      const res = await fetch(`${env.base}/api/budget`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = (await res.json()) as BudgetResponse;
      expect(body.config.limits.day?.costUSD).toBe(10);
      expect(body.status.level).toBe('warn');
      expect(body.status.metrics).toHaveLength(1);
      expect(body.status.metrics[0]).toMatchObject({ scope: 'global', metric: 'costUSD', used: 8, limit: 10, percent: 80, fired: [80] });
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });

  it('PUT salva os limites (grava o arquivo) e reavalia', async () => {
    const tmp = tempDir();
    const env = await start({}, tmp.dir);
    try {
      const res = await fetch(`${env.base}/api/budget`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ version: 1, limits: { day: { costUSD: 5, tokens: 2_000 } }, projects: { '/p/loja': { month: { costUSD: 50 } } } }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as BudgetResponse;
      expect(body.config.limits.day).toEqual({ costUSD: 5, tokens: 2_000 });
      expect(body.config.projects?.['/p/loja'].month?.costUSD).toBe(50);
      expect(body.status.level).toBe('over');
      expect(JSON.parse(readFileSync(env.file, 'utf8'))).toMatchObject({ limits: { day: { costUSD: 5, tokens: 2_000 } } });

      const again = (await (await fetch(`${env.base}/api/budget`)).json()) as BudgetResponse;
      expect(again.config.limits.day).toEqual({ costUSD: 5, tokens: 2_000 });
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });

  it('PUT inválido responde 400 e mantém o arquivo', async () => {
    const tmp = tempDir();
    const env = await start({}, tmp.dir);
    try {
      const before = readFileSync(env.file, 'utf8');
      const res = await fetch(`${env.base}/api/budget`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ version: 1, limits: { day: { costUSD: -1 } } }),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/limite inválido/);
      expect(readFileSync(env.file, 'utf8')).toBe(before);
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });

  it('PUT sem JSON, JSON quebrado e método não permitido', async () => {
    const tmp = tempDir();
    const env = await start({}, tmp.dir);
    try {
      const noJson = await fetch(`${env.base}/api/budget`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
      expect(noJson.status).toBe(415);

      const broken = await fetch(`${env.base}/api/budget`, { method: 'PUT', headers: JSON_HEADERS, body: '{' });
      expect(broken.status).toBe(400);

      const post = await fetch(`${env.base}/api/budget`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      expect(post.status).toBe(405);
      expect(post.headers.get('allow')).toBe('GET, PUT');
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });

  it('pela porta remota responde 403, mesmo com login', async () => {
    const tmp = tempDir();
    const env = await start({ remote: { is: () => true, allows: () => true } }, tmp.dir);
    try {
      const res = await fetch(`${env.base}/api/budget`);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toMatch(/próprio computador/);
      const put = await fetch(`${env.base}/api/budget`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ limits: {} }) });
      expect(put.status).toBe(403);
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });

  it('Host que não é o próprio computador responde 403', async () => {
    const tmp = tempDir();
    const env = await start({}, tmp.dir);
    try {
      const u = new URL(env.base);
      const status = await new Promise<number>((ok, fail) => {
        const req = http.request({ host: u.hostname, port: u.port, path: '/api/budget', headers: { Host: 'habblaud.lan' } }, (res) => {
          res.resume();
          res.on('end', () => ok(res.statusCode ?? 0));
        });
        req.on('error', fail);
        req.end();
      });
      expect(status).toBe(403);
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });

  it('sem o serviço de orçamento a rota responde 404', async () => {
    const tmp = tempDir();
    const env = await start({ budget: undefined }, tmp.dir);
    try {
      const res = await fetch(`${env.base}/api/budget`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('orçamento indisponível');
    } finally {
      await env.close();
      tmp.cleanup();
    }
  });
});
