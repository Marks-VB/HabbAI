// Pedido de permissão -> webhook: um disparo por pedido registrado, com os dados do pedido (e do agente),
// e nenhum disparo quando o pedido volta direto ao terminal. Erro de rede não pode quebrar o pedido.
import { describe, expect, it, vi } from 'vitest';
import { setQuiet } from '../log';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { PermissionRegistry, type RegistryOptions } from '../permissions/registry';
import { sendWebhook, type WebhookConfig, type WebhookPayload } from './webhook';

setQuiet(true);

const MAIN = 'acc:1';
const SESSION = 'sess-1';

function hookInput(over: Record<string, unknown> = {}) {
  return {
    session_id: SESSION,
    cwd: '/p/loja',
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_input: { command: 'npm test', description: 'Rodar os testes' },
    permission_suggestions: [],
    timeout_ms: 60_000,
    ...over,
  };
}

/** Registro de permissão disparando o webhook como o server/index.ts faz (fire-and-forget). */
function setup(opts: { cfg?: WebhookConfig; viewers?: number; fetch?: ReturnType<typeof vi.fn>; callback?: RegistryOptions['onPermissionRequested'] } = {}) {
  let now = 1_000_000;
  let registry: PermissionRegistry | undefined;
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: 0,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    permissions: () => registry?.snapshot() ?? new Map(),
    now: () => now,
  });
  office.addMain({ id: MAIN, account: 'acc', sessionId: SESSION, cwd: '/p/loja', role: 'Agente principal', startedAt: 0, status: 'working' });
  const cfg = opts.cfg ?? { url: 'https://example.test/hook' };
  const fetchFn = opts.fetch ?? vi.fn(async () => new Response('{}', { status: 200 }));
  const pending: Array<Promise<{ ok: boolean }>> = [];
  const reg = new PermissionRegistry({
    office,
    viewers: () => opts.viewers ?? 1,
    now: () => now,
    onPermissionRequested:
      opts.callback ??
      ((info, agentId) => {
        const agent = office.get(agentId);
        const payload: WebhookPayload = {
          event: 'permission_request',
          agentName: agent?.name,
          title: info.title,
          text: info.text,
          tool: info.tool,
          url: 'http://localhost:4747',
          timestamp: info.createdAt,
        };
        pending.push(sendWebhook(cfg, payload, fetchFn as unknown as typeof fetch));
      }),
  });
  registry = reg;
  return { office, registry: reg, fetchFn, pending, clock: { now: () => now, advance: (ms: number) => (now += ms) } };
}

const registered = (r: ReturnType<PermissionRegistry['register']>): string => {
  if ('skip' in r) throw new Error(`pulou: ${r.skip}`);
  return r.id;
};

describe('pedido de permissão -> webhook', () => {
  it('um pedido registrado dispara um webhook com agente, título, texto, ferramenta e timestamp', async () => {
    const { office, registry, fetchFn, pending } = setup();
    const id = registered(registry.register(hookInput()));
    await Promise.all(pending);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://example.test/hook');
    const body = await bodyOf(init as RequestInit | undefined);
    expect(body).toEqual({
      event: 'permission_request',
      agentName: office.get(MAIN)!.name,
      title: expect.stringMatching(/^Bash\(npm test/),
      text: 'Rodando testes',
      tool: 'Bash',
      url: 'http://localhost:4747',
      timestamp: registry.detail(id)!.createdAt,
    });
    expect(registry.detail(id)).toMatchObject({ id, tool: 'Bash' });
  });

  it('um webhook por pedido: dois pedidos, dois disparos', async () => {
    const { registry, fetchFn, pending } = setup();
    registered(registry.register(hookInput()));
    registered(registry.register(hookInput({ tool_input: { command: 'npm run build' } })));
    await Promise.all(pending);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(2);
  });

  it('pedido que volta direto ao terminal (sem página ou sessão desconhecida) não dispara webhook', () => {
    const closed = setup({ viewers: 0 });
    expect(closed.registry.register(hookInput())).toEqual({ skip: 'no-viewers' });
    expect(closed.pending).toHaveLength(0);
    expect(closed.fetchFn).not.toHaveBeenCalled();

    const unknown = setup();
    expect(unknown.registry.register(hookInput({ session_id: 'outra' }))).toEqual({ skip: 'unknown-session' });
    expect(unknown.pending).toHaveLength(0);
    expect(unknown.fetchFn).not.toHaveBeenCalled();
  });

  it('erro de rede no webhook não quebra o pedido: ele fica pendente e pode ser aprovado normalmente', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND example.test');
    });
    const { office, registry, pending } = setup({ fetch: fetchFn });
    const id = registered(registry.register(hookInput()));
    expect(office.commit().snapshot.agents.find((a) => a.id === MAIN)?.permission).toMatchObject({ id, tool: 'Bash' });
    await expect(Promise.all(pending)).resolves.toEqual([{ ok: false }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // O pedido continua respondível: o webhook é só um aviso.
    expect(registry.decide(id, { behavior: 'allow' })).toBe('ok');
    expect(office.commit().snapshot.agents.find((a) => a.id === MAIN)?.permission).toBeUndefined();
  });

  it('HTTP de erro no webhook também não quebra o pedido', async () => {
    const fetchFn = vi.fn(async () => new Response('erro', { status: 500 }));
    const { registry, pending } = setup({ fetch: fetchFn });
    const id = registered(registry.register(hookInput()));
    await expect(Promise.all(pending)).resolves.toEqual([{ ok: false }]);
    expect(registry.decide(id, { behavior: 'deny', message: 'não' })).toBe('ok');
  });
});

async function bodyOf(init: RequestInit | undefined): Promise<Record<string, unknown>> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}
