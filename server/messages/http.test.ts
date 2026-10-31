// Mensagens pelo escritório pelas rotas de verdade (guard, app e server/messages/http.ts): a trava da config
// (terminal + HABBLAUD_MENSAGENS), a trava das rotas (recurso desligado / Host que não é local), os status (400, 404,
// 405, 409, 429), o fluxo completo página → caixa de entrada do plugin → confirmação → consulta, e o demo.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { InboxMessage, OfficeSnapshot, OutboxMessage } from '../../shared/types';
import { AccountsService } from '../accounts/service';
import { loadConfig, messagesOffReason } from '../config';
import { createApiHandler } from '../http/app';
import { createRequestGuard } from '../http/guard';
import { Hub } from '../http/sse';
import { setQuiet } from '../log';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { request } from '../test/permission-server';
import { tempDir } from '../test/fixtures';
import { createMessageRoutes } from './http';
import { MessageRegistry, type MessageRegistryOptions } from './registry';

setQuiet(true);

const MAIN = 'acc:1';
const SESSION = 'sess-1';

interface MessageServer {
  base: string;
  office: Office;
  registry?: MessageRegistry;
  close(): Promise<void>;
}

/**
 * Office + Hub + rotas de verdade numa porta livre do 127.0.0.1, com um agente principal na sessão "sess-1"
 * (`noAgent` = escritório vazio, para o broadcast sem ninguém).
 */
async function serveMessages(opts: { enabled?: boolean; demo?: boolean; noAgent?: boolean; registry?: Partial<MessageRegistryOptions> } = {}): Promise<MessageServer> {
  const tmp = tempDir();
  const enabled = opts.enabled ?? true;
  const late: { registry?: MessageRegistry } = {};
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: Date.now(),
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    terminal: true,
    messages: enabled ? () => late.registry?.reachable() ?? new Set() : undefined,
  });
  const hub = new Hub(office, { throttleMs: 10 });
  const registry = enabled
    ? new MessageRegistry({
        office,
        demoAgent: (id) => office.demoAgent(id),
        demoAgents: () => office.demoAgents(),
        demoDeliver: (id, text) => office.deliverDemoMessage(id, text),
        tickMs: 20,
        ...opts.registry,
      })
    : undefined;
  late.registry = registry;
  registry?.start();
  const accounts = new AccountsService({ dirs: [], home: tmp.dir, env: {}, onChange: () => {} });
  const api = createApiHandler({
    office,
    hub,
    accounts,
    sources: () => [],
    version: 't',
    inDocker: false,
    terminal: true,
    messages: registry ? createMessageRoutes(registry) : undefined,
  });
  const guard = createRequestGuard({ allowedHosts: new Set(['habblaud.lan']) });
  const server = http.createServer((req, res) => {
    if (guard(req, res)) return;
    if (!api(req, res, new URL(req.url ?? '/', 'http://x'))) res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  if (!opts.noAgent) office.addMain({ id: MAIN, account: 'acc', sessionId: SESSION, cwd: '/p/loja', role: 'Agente principal', startedAt: Date.now(), status: 'idle' });
  if (opts.demo) office.setDemo(true);
  return {
    base: `http://127.0.0.1:${port}`,
    office,
    registry,
    close: () =>
      new Promise((ok) => {
        registry?.stop();
        hub.stop();
        server.closeAllConnections();
        server.close(() => {
          tmp.cleanup();
          ok();
        });
      }),
  };
}

let srv: MessageServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

const post = (s: MessageServer, path: string, body: unknown, headers?: Record<string, string>) => request(s.base, path, { method: 'POST', body, headers });
const snapshot = async (s: MessageServer) => (await request(s.base, '/api/snapshot')).json as OfficeSnapshot;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe('trava das mensagens (config)', () => {
  it('messagesOffReason: a trava do terminal e HABBLAUD_MENSAGENS (0/false/off/no desligam)', () => {
    expect(messagesOffReason({}, '127.0.0.1', false)).toBeUndefined();
    for (const v of ['1', 'true', 'sim', '']) expect(messagesOffReason({ HABBLAUD_MENSAGENS: v }, '127.0.0.1', false), v).toBeUndefined();
    for (const v of ['0', 'false', 'off', 'no']) expect(messagesOffReason({ HABBLAUD_MENSAGENS: v }, '127.0.0.1', false)).toBe(`HABBLAUD_MENSAGENS=${v}`);
    expect(messagesOffReason({}, '0.0.0.0', false)).toMatch(/^mesma trava do terminal: a porta está exposta/);
    expect(messagesOffReason({ HABBLAUD_TERMINAL: '0' }, '127.0.0.1', false)).toMatch(/HABBLAUD_TERMINAL=0/);
    // Ligar as mensagens não liga o que a trava do terminal desliga.
    expect(messagesOffReason({ HABBLAUD_MENSAGENS: '1' }, '0.0.0.0', false)).toBeDefined();
    expect(messagesOffReason({ HABBLAUD_MENSAGENS: '1', HABBLAUD_BIND: '127.0.0.1' }, '0.0.0.0', true)).toBeUndefined();
    expect(messagesOffReason({ HABBLAUD_MENSAGENS: '1' }, '0.0.0.0', true)).toMatch(/HABBLAUD_BIND/);
  });

  it('loadConfig preenche ServerConfig.messages', () => {
    const tmp = tempDir();
    try {
      const cfg = (env: NodeJS.ProcessEnv) => loadConfig({ HOME: tmp.dir, HABBLAUD_IN_DOCKER: '0', ...env }, []);
      expect(cfg({})).toMatchObject({ terminal: true, messages: true });
      expect(cfg({ HABBLAUD_MENSAGENS: '0' })).toMatchObject({ terminal: true, messages: false });
      expect(cfg({ HABBLAUD_TERMINAL: '0' })).toMatchObject({ terminal: false, messages: false });
      expect(cfg({ HABBLAUD_HOST: '0.0.0.0', HABBLAUD_MENSAGENS: '1' })).toMatchObject({ terminal: false, messages: false });
      expect(cfg({ HABBLAUD_IN_DOCKER: '1', HABBLAUD_HOST: '0.0.0.0', HABBLAUD_BIND: '127.0.0.1' })).toMatchObject({ terminal: true, messages: true });
    } finally {
      tmp.cleanup();
    }
  });
});

describe('trava das rotas', () => {
  const ROUTES: Array<[string, string]> = [
    ['POST', '/api/messages'],
    ['POST', '/api/messages/broadcast'],
    ['GET', '/api/messages/x'],
    ['POST', '/api/mod/inbox'],
    ['POST', '/api/mod/inbox/ack'],
  ];

  it('desligado: 403 em todas as rotas; health e snapshot dizem messages: false; /api/mod/summary continua no ar', async () => {
    srv = await serveMessages({ enabled: false });
    for (const [method, path] of ROUTES) {
      const r = await request(srv.base, path, { method, body: method === 'POST' ? {} : undefined });
      expect(r.status, `${method} ${path}`).toBe(403);
      expect(r.json).toMatchObject({ error: expect.stringMatching(/desligad/) });
    }
    expect((await request(srv.base, '/api/health')).json).toMatchObject({ messages: false });
    expect((await snapshot(srv)).meta.messages).toBe(false);
    const summary = await request(srv.base, '/api/mod/summary');
    expect(summary.status).toBe(200);
    expect(summary.json).toMatchObject({ version: 't', agents: 1 });
  });

  it('Host que não é local (proxy/túnel de HABBLAUD_ALLOWED_HOSTS ou IP da rede): 403', async () => {
    srv = await serveMessages();
    expect((await request(srv.base, '/api/health')).json).toMatchObject({ messages: true });
    expect((await snapshot(srv)).meta.messages).toBe(true);
    for (const host of ['habblaud.lan', '192.168.0.10:4747']) {
      for (const [method, path] of ROUTES) {
        const r = await request(srv.base, path, { method, body: method === 'POST' ? { session: SESSION } : undefined, headers: { Host: host } });
        expect(r.status, `${host} ${path}`).toBe(403);
        expect(r.json).toMatchObject({ error: expect.stringMatching(/próprio computador/) });
      }
    }
    expect((await post(srv, '/api/mod/inbox', { session: SESSION }, { Host: 'localhost:4747' })).status).toBe(200);
  });

  it('guard: POST sem JSON (415) ou de outra origem (403) é barrado antes da rota', async () => {
    srv = await serveMessages();
    expect((await post(srv, '/api/messages', 'agentId=x&text=oi', { 'Content-Type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await post(srv, '/api/mod/inbox', { session: SESSION }, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(srv, '/api/messages', { agentId: MAIN, text: 'oi' }, { Origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('rotas', () => {
  it('400 (corpo inválido, vazio, longo demais), 404 (agente ou mensagem desconhecidos), 405, 409 e 429', async () => {
    srv = await serveMessages();
    for (const body of [{}, '{quebrado', { agentId: MAIN }, { agentId: MAIN, text: '   ' }, { agentId: MAIN, text: 'x'.repeat(20_001) }]) {
      const r = await post(srv, '/api/messages', body);
      expect(r.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(r.json).toMatchObject({ error: expect.any(String) });
    }
    expect((await post(srv, '/api/messages', { agentId: 'nao-existe', text: 'oi' })).status).toBe(404);
    expect((await request(srv.base, '/api/messages/nao-existe')).status).toBe(404);
    // Sessão sem o plugin conectado.
    const noPlugin = await post(srv, '/api/messages', { agentId: MAIN, text: 'oi' });
    expect(noPlugin.status).toBe(409);
    expect(noPlugin.json).toMatchObject({ error: expect.stringMatching(/habblaud-mensagens/) });
    expect((await request(srv.base, '/api/messages')).status).toBe(405);
    expect((await request(srv.base, '/api/mod/inbox')).status).toBe(405);
    expect((await request(srv.base, '/api/messages/x', { method: 'POST', body: {} })).status).toBe(405);
    expect((await request(srv.base, '/api/messages/x/y')).status).toBe(404);
    expect((await post(srv, '/api/mod/inbox', {})).status).toBe(400);
    expect((await post(srv, '/api/mod/inbox/ack', { session: SESSION })).status).toBe(400);

    // Com o plugin: 5 na fila, a 6ª recebe 429.
    expect((await post(srv, '/api/mod/inbox', { session: SESSION, account: 'acc' })).json).toEqual({ messages: [] });
    for (let i = 0; i < 5; i++) expect((await post(srv, '/api/messages', { agentId: MAIN, text: `m${i}` })).status).toBe(201);
    const full = await post(srv, '/api/messages', { agentId: MAIN, text: 'demais' });
    expect(full.status).toBe(429);
    expect(full.json).toMatchObject({ error: expect.stringMatching(/5 mensagens/) });
  });

  it('caixa de entrada de sessão desconhecida: 200 com nenhuma mensagem (nunca 404)', async () => {
    srv = await serveMessages();
    const r = await post(srv, '/api/mod/inbox', { session: 'nao-existe', account: 'acc' });
    expect(r).toMatchObject({ status: 200, json: { messages: [] } });
    expect((await post(srv, '/api/mod/inbox/ack', { session: 'nao-existe', results: [{ id: 'x', ok: true }] })).json).toEqual({ ok: true });
  });

  it('fluxo: plugin conecta (canMessage) → página manda (201) → plugin busca → confirma → página consulta (delivered) e o feed mostra', async () => {
    srv = await serveMessages();
    expect((await snapshot(srv)).agents.find((a) => a.id === MAIN)?.canMessage).toBeUndefined();
    expect((await post(srv, '/api/mod/inbox', { session: SESSION, account: 'acc' })).json).toEqual({ messages: [] });
    await sleep(30);
    expect((await snapshot(srv)).agents.find((a) => a.id === MAIN)?.canMessage).toBe(true);

    const text = 'Agora roda os testes de novo\ne me diga o que falhou ';
    const created = await post(srv, '/api/messages', { agentId: MAIN, text });
    expect(created.status).toBe(201);
    const msg = created.json as OutboxMessage;
    expect(msg).toMatchObject({ agentId: MAIN, status: 'queued' });
    expect(created.text).not.toContain('testes');
    expect(((await request(srv.base, `/api/messages/${encodeURIComponent(msg.id)}`)).json as OutboxMessage).status).toBe('queued');

    const inbox = (await post(srv, '/api/mod/inbox', { session: SESSION, account: 'acc' })).json as { messages: InboxMessage[] };
    expect(inbox.messages).toEqual([{ id: msg.id, text }]);
    expect(((await request(srv.base, `/api/messages/${encodeURIComponent(msg.id)}`)).json as OutboxMessage).status).toBe('sent');

    expect((await post(srv, '/api/mod/inbox/ack', { session: SESSION, results: [{ id: msg.id, ok: true }] })).json).toEqual({ ok: true });
    const done = (await request(srv.base, `/api/messages/${encodeURIComponent(msg.id)}`)).json as OutboxMessage;
    expect(done).toMatchObject({ id: msg.id, status: 'delivered' });
    expect(done.updatedAt).toBeGreaterThanOrEqual(done.createdAt);
    const agent = (await snapshot(srv)).agents.find((a) => a.id === MAIN)!;
    expect(agent.recent.at(-1)).toMatchObject({ icon: '✉️', text: 'Mensagem pelo HabbAI', detail: 'Agora roda os testes de novo e me diga o que falhou' });
  });

  it('a sessão some (sem rodadas): canMessage volta a falso e a mensagem na fila falha no prazo', async () => {
    let now = 1_000_000;
    srv = await serveMessages({ registry: { now: () => now, presenceMs: 100, queuedTimeoutMs: 150 } });
    await post(srv, '/api/mod/inbox', { session: SESSION });
    const created = await post(srv, '/api/messages', { agentId: MAIN, text: 'oi' });
    expect(created.status).toBe(201);
    const msg = created.json as OutboxMessage;
    now += 250;
    srv.registry!.tick();
    expect((await snapshot(srv)).agents.find((a) => a.id === MAIN)?.canMessage).toBeUndefined();
    expect((await request(srv.base, `/api/messages/${encodeURIComponent(msg.id)}`)).json).toMatchObject({ status: 'failed', error: expect.stringMatching(/não buscou/) });
    expect((await post(srv, '/api/messages', { agentId: MAIN, text: 'oi' })).status).toBe(409);
  });

  it('demo: a mensagem a um agente fictício é entregue sem passar por sessão nenhuma', async () => {
    srv = await serveMessages({ demo: true, registry: { demoDeliveryMs: 50 } });
    const demo = (await snapshot(srv)).agents.find((a) => a.id.startsWith('demo:') && a.kind === 'main' && a.status !== 'offline')!;
    expect(demo.canMessage).toBe(true);
    const created = await post(srv, '/api/messages', { agentId: demo.id, text: 'oi, demo' });
    expect(created.status).toBe(201);
    const msg = created.json as OutboxMessage;
    expect((await post(srv, '/api/mod/inbox', { session: demo.sessionId })).json).toEqual({ messages: [] });
    await sleep(150);
    expect((await request(srv.base, `/api/messages/${encodeURIComponent(msg.id)}`)).json).toMatchObject({ status: 'delivered' });
    srv.office.tick();
    const after = (await snapshot(srv)).agents.find((a) => a.id === demo.id)!;
    expect(after.recent.some((a) => a.text === 'Mensagem pelo HabbAI' && a.detail === 'oi, demo')).toBe(true);
  });

  it('broadcast: envia instrução para todos os agentes principais ativos', async () => {
    srv = await serveMessages({ demo: true });
    const res = await post(srv, '/api/messages/broadcast', { text: 'rodar testes' });
    expect(res.status).toBe(201);
    expect((res.json as { count: number }).count).toBeGreaterThan(0);
  });

  it('demo com o recurso desligado: os agentes fictícios também não recebem', async () => {
    srv = await serveMessages({ enabled: false, demo: true });
    expect((await snapshot(srv)).agents.filter((a) => a.canMessage)).toEqual([]);
  });
});

describe('broadcast (ordem geral)', () => {
  const OTHER = 'acc:2';
  const GONE = 'acc:3';
  const SUB = `${SESSION}:a1b2c3`;

  it('corpo inválido (vazio, só espaços, tipo errado, longo demais): 400; GET: 405; origem estranha: 403', async () => {
    srv = await serveMessages();
    for (const body of [{}, null, [], { text: '' }, { text: '  \n ' }, { text: 3 }, { text: 'x'.repeat(20_001) }]) {
      const r = await post(srv, '/api/messages/broadcast', body);
      expect(r.status, JSON.stringify(body).slice(0, 30)).toBe(400);
      expect(r.json).toMatchObject({ error: expect.any(String) });
    }
    expect((await request(srv.base, '/api/messages/broadcast')).status).toBe(405);
    expect((await post(srv, '/api/messages/broadcast', { text: 'oi' }, { Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('nenhum agente ativo: 201 com a lista vazia (não é erro)', async () => {
    srv = await serveMessages({ noAgent: true });
    const r = await post(srv, '/api/messages/broadcast', { text: 'bom dia' });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ sent: [], count: 0 });
  });

  it('cria uma entrega para cada principal com o plugin: não para subagente nem para quem saiu', async () => {
    srv = await serveMessages();
    srv.office.addMain({ id: OTHER, account: 'acc', sessionId: 'sess-2', cwd: '/p/api', role: 'Agente principal', startedAt: Date.now(), status: 'idle' });
    srv.office.addMain({ id: GONE, account: 'acc', sessionId: 'sess-3', cwd: '/p/loja', role: 'Agente principal', startedAt: Date.now(), status: 'idle' });
    srv.office.addSub({ id: SUB, parentId: MAIN, sessionId: SESSION, role: 'Explore', background: false, startedAt: Date.now() });
    srv.office.closeMain(GONE);
    // Duas sessões com o plugin conectado (a de quem saiu não pergunta mais).
    for (const session of [SESSION, 'sess-2']) expect((await post(srv, '/api/mod/inbox', { session, account: 'acc' })).json).toEqual({ messages: [] });

    const text = '  rode a suíte completa  ';
    const r = await post(srv, '/api/messages/broadcast', { text });
    expect(r.status).toBe(201);
    const { sent, count } = r.json as { sent: OutboxMessage[]; count: number };
    expect(count).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.agentId).sort()).toEqual([MAIN, OTHER].sort());
    expect(sent.some((m) => m.agentId === SUB || m.agentId === GONE)).toBe(false);
    for (const m of sent) {
      expect(m).toEqual({ id: expect.stringMatching(/^m-/), agentId: m.agentId, status: 'queued', createdAt: expect.any(Number), updatedAt: expect.any(Number) });
    }
    // A resposta não leva o texto; o plugin busca a mesma instrução, já aparada, nas duas sessões.
    expect(r.text).not.toContain('suíte');
    for (const [session, agentId] of [
      [SESSION, MAIN],
      ['sess-2', OTHER],
    ] as const) {
      const inbox = (await post(srv, '/api/mod/inbox', { session, account: 'acc' })).json as { messages: InboxMessage[] };
      expect(inbox.messages).toEqual([{ id: sent.find((m) => m.agentId === agentId)!.id, text: 'rode a suíte completa' }]);
    }
    expect((await post(srv, '/api/mod/inbox', { session: 'sess-3', account: 'acc' })).json).toEqual({ messages: [] });
  });

  it('demo: os agentes fictícios também recebem (e o principal sem plugin fica de fora)', async () => {
    srv = await serveMessages({ demo: true });
    const expected = (await snapshot(srv)).agents.filter((a) => a.id.startsWith('demo:') && a.kind === 'main' && a.status !== 'offline' && a.status !== 'done' && a.canMessage === true);
    const r = await post(srv, '/api/messages/broadcast', { text: 'bom dia, pessoal' });
    expect(r.status).toBe(201);
    const { sent, count } = r.json as { sent: OutboxMessage[]; count: number };
    expect(count).toBe(sent.length);
    expect(count).toBeGreaterThan(0);
    expect(sent.map((m) => m.agentId).sort()).toEqual(expected.map((a) => a.id).sort());
    expect(sent.some((m) => m.agentId === MAIN)).toBe(false);
  });
});
