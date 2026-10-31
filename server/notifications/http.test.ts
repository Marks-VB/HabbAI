// Central de notificações pelas rotas de verdade (guard, app e server/notifications/http.ts): lista e filtro,
// marcar como lida, marcar todas, preferências (GET/PUT e validação), travas de Host e a integração com o pedido de
// permissão e o fim de sessão. O webhook é um fetch falso: nenhuma rede de verdade.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationItem, NotificationPrefs } from '../../shared/types';
import { AccountsService } from '../accounts/service';
import { createApiHandler } from '../http/app';
import { createRequestGuard } from '../http/guard';
import { Hub } from '../http/sse';
import { setQuiet } from '../log';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { createPermissionRoutes } from '../permissions/http';
import { PermissionRegistry } from '../permissions/registry';
import { hookJson, MAIN, request, SESSION } from '../test/permission-server';
import { tempDir } from '../test/fixtures';
import { NotificationCenter } from './center';
import { createNotificationRoutes } from './http';
import { NotificationInbox } from './inbox';
import { defaultNotificationPrefs, NotificationPrefsStore } from './prefs';

setQuiet(true);

interface NotificationServer {
  base: string;
  office: Office;
  inbox: NotificationInbox;
  prefs: NotificationPrefsStore;
  webhookCalls: Array<{ url: string; body: string }>;
  viewers: { count: number };
  close(): Promise<void>;
}

async function serveNotifications(opts: { webhook?: boolean } = {}): Promise<NotificationServer> {
  const tmp = tempDir();
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: Date.now(),
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    terminal: true,
    onSessionClosed: (info, project) =>
      center.sessionEnd({ id: info.id, name: info.name, account: info.account }, project),
  });
  const hub = new Hub(office, { throttleMs: 10 });
  const inbox = new NotificationInbox(`${tmp.dir}/notifications.json`);
  const prefs = new NotificationPrefsStore(`${tmp.dir}/notifications-prefs.json`);
  const webhookCalls: Array<{ url: string; body: string }> = [];
  const viewers = { count: 1 };
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    webhookCalls.push({ url: String(url), body: String(init?.body) });
    return new Response('{}', { status: 200 });
  };
  const center = new NotificationCenter({
    inbox,
    prefs,
    webhook: opts.webhook === false ? {} : { url: 'https://example.test/habblaud' },
    viewers: () => viewers.count,
    url: 'http://localhost:4747',
    fetchFn: fakeFetch as unknown as typeof fetch,
  });
  const registry = new PermissionRegistry({
    office,
    viewers: () => 1,
    tickMs: 50,
    onPermissionRequested: (info, agentId) => {
      const agent = office.get(agentId);
      center.permission(
        info,
        { id: agentId, name: agent?.name, account: agent?.account },
        agent ? office.roomPath(agent.roomId) : undefined,
      );
    },
  });
  registry.start();
  const accounts = new AccountsService({ dirs: [], home: tmp.dir, env: {}, onChange: () => {} });
  const api = createApiHandler({
    office,
    hub,
    accounts,
    sources: () => [],
    version: 't',
    inDocker: false,
    terminal: true,
    permissions: createPermissionRoutes(registry),
    notifications: createNotificationRoutes({ inbox, prefs }),
  });
  const guard = createRequestGuard({ allowedHosts: new Set(['habblaud.lan']) });
  const server = http.createServer((req, res) => {
    if (guard(req, res)) return;
    if (!api(req, res, new URL(req.url ?? '/', 'http://x'))) res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  office.addMain({
    id: MAIN,
    account: 'acc',
    sessionId: SESSION,
    cwd: '/p/loja',
    role: 'Agente principal',
    startedAt: Date.now(),
    status: 'working',
  });
  return {
    base: `http://127.0.0.1:${port}`,
    office,
    inbox,
    prefs,
    webhookCalls,
    viewers,
    close: () =>
      new Promise((ok) => {
        registry.stop();
        hub.stop();
        server.closeAllConnections();
        server.close(() => {
          tmp.cleanup();
          ok();
        });
      }),
  };
}

let srv: NotificationServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

const post = (s: NotificationServer, path: string, body: unknown = {}, headers?: Record<string, string>) =>
  request(s.base, path, { method: 'POST', body, headers });
const put = (s: NotificationServer, path: string, body: unknown, headers?: Record<string, string>) =>
  request(s.base, path, { method: 'PUT', body, headers });
const list = async (s: NotificationServer, query = '') =>
  (await request(s.base, `/api/notifications${query}`)).json as {
    notifications: NotificationItem[];
    unread: number;
    total: number;
    quiet: boolean;
  };
const permission = (s: NotificationServer, over: Record<string, unknown> = {}) =>
  post(s, '/api/permissions', hookJson(over));
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function waitForCalls(s: NotificationServer, n: number): Promise<void> {
  for (let i = 0; i < 80 && s.webhookCalls.length < n; i++) await sleep(5);
  expect(s.webhookCalls).toHaveLength(n);
}

describe('rotas da central de notificações', () => {
  it('lista vazia, pedido de permissão entra no histórico e o webhook recebe o alerta', async () => {
    srv = await serveNotifications();
    expect(await list(srv)).toEqual({ notifications: [], unread: 0, total: 0, quiet: false });
    expect((await permission(srv)).status).toBe(201);
    await waitForCalls(srv, 1);
    const name = srv.office.get(MAIN)?.name;
    const body = JSON.parse(srv.webhookCalls[0].body) as Record<string, unknown>;
    expect(body).toMatchObject({ event: 'permission_request', agentName: name, tool: 'Bash' });

    const after = await list(srv);
    expect(after).toMatchObject({ unread: 1, total: 1, quiet: false });
    expect(after.notifications[0]).toMatchObject({
      type: 'permission',
      status: 'new',
      agentId: MAIN,
      agentName: name,
      account: 'acc',
      project: '/p/loja',
      tool: 'Bash',
    });
    expect(after.notifications[0].title).toContain(String(name));
    // O histórico guarda um resumo curto, não o pedido inteiro.
    expect(after.notifications[0].summary?.length ?? 0).toBeLessThanOrEqual(180);
    expect(JSON.stringify(after.notifications[0])).not.toContain('permission_suggestions');
  });

  it('pergunta vira o tipo question e o fim de sessão resolve o que ficou aberto', async () => {
    srv = await serveNotifications();
    expect(
      (
        await permission(srv, {
          tool_name: 'AskUserQuestion',
          tool_input: { questions: [{ question: 'Qual caminho?', options: [{ label: 'A' }, { label: 'B' }] }] },
        })
      ).status,
    ).toBe(201);
    await waitForCalls(srv, 1);
    expect((await list(srv)).notifications[0]).toMatchObject({ type: 'question', summary: 'Qual caminho?' });

    srv.office.closeMain(MAIN);
    const after = await list(srv);
    expect(after.notifications[0]).toMatchObject({
      type: 'session-end',
      status: 'new',
      agentId: MAIN,
      project: '/p/loja',
    });
    expect(after.notifications[1].status).toBe('resolved');
    expect(srv.webhookCalls).toHaveLength(1);
  });

  it('marcar como lida, marcar todas e o filtro de não lidas', async () => {
    srv = await serveNotifications();
    await permission(srv);
    await permission(srv);
    await waitForCalls(srv, 2);
    const first = (await list(srv, '?filter=unread')).notifications;
    expect(first).toHaveLength(2);

    const read = await post(srv, `/api/notifications/${encodeURIComponent(first[0].id)}/read`);
    expect(read.status).toBe(200);
    expect(read.json).toMatchObject({ ok: true, status: 'read', unread: 1 });
    expect(
      (
        await request(srv.base, `/api/notifications/${encodeURIComponent(first[0].id)}/read`, {
          method: 'POST',
          body: {},
        })
      ).status,
    ).toBe(200);
    expect((await list(srv, '?filter=unread')).notifications.map((n) => n.id)).toEqual([first[1].id]);

    const all = await post(srv, '/api/notifications/read-all');
    expect(all.json).toEqual({ ok: true, read: 1, unread: 0 });
    expect((await list(srv, '?filter=unread')).notifications).toEqual([]);
    expect((await list(srv)).total).toBe(2);
  });

  it('preferências: GET padrão, PUT parcial validado e alerta externo respeitando tipo, silêncio e janela do app', async () => {
    srv = await serveNotifications();
    const initial = await request(srv.base, '/api/notifications/prefs');
    expect(initial.status).toBe(200);
    expect(initial.json).toMatchObject({ quiet: false, prefs: defaultNotificationPrefs() });

    await permission(srv);
    await waitForCalls(srv, 1);

    // Tipo desligado: continua no histórico, sem webhook.
    expect((await put(srv, '/api/notifications/prefs', { types: { permission: false } })).status).toBe(200);
    await permission(srv);
    await sleep(40);
    expect(srv.webhookCalls).toHaveLength(1);
    expect((await list(srv)).total).toBe(2);

    // Silêncio: idem.
    expect(
      (
        await put(srv, '/api/notifications/prefs', {
          types: { permission: true },
          quiet: { enabled: true, start: '00:00', end: '23:59' },
        })
      ).status,
    ).toBe(200);
    expect((await list(srv)).quiet).toBe(true);
    await permission(srv);
    await sleep(40);
    expect(srv.webhookCalls).toHaveLength(1);

    // Só na janela do app: sem página aberta, nada sai.
    expect(
      (await put(srv, '/api/notifications/prefs', { quiet: { enabled: false }, appWindowOnly: true })).status,
    ).toBe(200);
    srv.viewers.count = 0;
    await permission(srv);
    await sleep(40);
    expect(srv.webhookCalls).toHaveLength(1);
    srv.viewers.count = 1;
    await permission(srv);
    await waitForCalls(srv, 2);

    const saved = (await request(srv.base, '/api/notifications/prefs')).json as { prefs: NotificationPrefs };
    expect(saved.prefs).toMatchObject({ types: { permission: true }, appWindowOnly: true });
  });

  it('preferências por projeto, conta e ferramenta barram o alerta', async () => {
    srv = await serveNotifications();
    const prefs = { ...defaultNotificationPrefs(), projects: { '/p/loja': false } };
    expect((await put(srv, '/api/notifications/prefs', prefs)).status).toBe(200);
    await permission(srv);
    await sleep(40);
    expect(srv.webhookCalls).toHaveLength(0);
    expect((await list(srv)).total).toBe(1);
  });

  it('400 (payload inválido), 404 (id desconhecido), 405, 404 de rota e 403 de Host/remoto', async () => {
    srv = await serveNotifications();
    for (const bad of [
      { outra: true },
      { types: { permission: 'sim' } },
      { quiet: { start: '25:00' } },
      { appWindowOnly: 'nao' },
      [],
    ]) {
      const r = await put(srv, '/api/notifications/prefs', bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await put(srv, '/api/notifications/prefs', 'x'.repeat(80_000))).status).toBe(413);
    expect((await post(srv, '/api/notifications/nao-existe/read')).status).toBe(404);
    expect((await request(srv.base, '/api/notifications', { method: 'POST', body: {} })).status).toBe(405);
    expect((await request(srv.base, '/api/notifications/prefs', { method: 'POST', body: {} })).status).toBe(405);
    expect((await request(srv.base, '/api/notifications/qualquer/coisa')).status).toBe(404);
    expect((await request(srv.base, '/api/notifications', { headers: { Host: 'habblaud.lan' } })).status).toBe(403);
    expect(
      (await request(srv.base, '/api/notifications/prefs', { headers: { Host: '192.168.0.10:4747' } })).status,
    ).toBe(403);
  });

  it('access e health dizem que a central está ligada', async () => {
    srv = await serveNotifications();
    expect((await request(srv.base, '/api/access')).json).toMatchObject({ notifications: true });
    expect((await request(srv.base, '/api/health')).json).toMatchObject({ notifications: true });
  });

  it('sem webhook configurado, o item entra no histórico e nada é enviado', async () => {
    srv = await serveNotifications({ webhook: false });
    await permission(srv);
    await sleep(40);
    expect(srv.webhookCalls).toHaveLength(0);
    expect((await list(srv)).total).toBe(1);
  });
});
