// Notificações por webhook: configuração pelo ambiente, o corpo próprio de cada serviço (Discord, Slack,
// Telegram e webhook genérico) e a regra de ouro: uma falha de rede/HTTP nunca rejeita (o pedido de
// permissão que disparou a notificação segue de pé).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWebhookConfig, sendWebhook, type WebhookPayload } from './webhook';

const AT = 1_700_000_000_000;

const payload: WebhookPayload = {
  event: 'permission_request',
  agentName: 'Rafael',
  title: 'Permissão necessária',
  text: 'Bash: git push origin main',
  tool: 'Bash',
  url: 'http://localhost:4747',
  timestamp: AT,
};

/** fetch falso que responde com o status dado e guarda as chamadas. */
function fakeFetch(status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{}', { status }));
}

const bodyOf = (call: unknown[]): Record<string, unknown> => JSON.parse(String((call[1] as RequestInit).body));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('configuração do webhook', () => {
  it('loadWebhookConfig lê e apara as variáveis de ambiente', () => {
    const cfg = loadWebhookConfig({
      HABBLAUD_WEBHOOK_URL: '  https://discord.com/api/webhooks/123/abc  ',
      HABBLAUD_TELEGRAM_BOT_TOKEN: 'tok123',
      HABBLAUD_TELEGRAM_CHAT_ID: 'chat456',
    });
    expect(cfg).toEqual({
      url: 'https://discord.com/api/webhooks/123/abc',
      telegramToken: 'tok123',
      telegramChatId: 'chat456',
    });
    // Vazio/só espaços = não configurado.
    expect(loadWebhookConfig({ HABBLAUD_WEBHOOK_URL: '   ', HABBLAUD_TELEGRAM_BOT_TOKEN: '', HABBLAUD_TELEGRAM_CHAT_ID: ' ' })).toEqual({
      url: undefined,
      telegramToken: undefined,
      telegramChatId: undefined,
    });
  });

  it('sem nada configurado: não chama a rede e responde ok: false', async () => {
    const fetchFn = fakeFetch();
    await expect(sendWebhook({}, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('corpo por serviço', () => {
  it('webhook genérico recebe o payload inteiro, como veio', async () => {
    const fetchFn = fakeFetch();
    await expect(sendWebhook({ url: 'https://example.test/hooks/abc' }, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://example.test/hooks/abc');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });

  it('Discord: content com título/agente/texto/link, embed com ferramenta e o timestamp do pedido', async () => {
    const fetchFn = fakeFetch();
    await sendWebhook({ url: 'https://discord.com/api/webhooks/1/2' }, payload, fetchFn as unknown as typeof fetch);
    const body = bodyOf(fetchFn.mock.calls[0]);
    expect(body.content).toContain('HabbAI: Permissão necessária');
    expect(body.content).toContain('Agente:** Rafael');
    expect(body.content).toContain('Bash: git push origin main');
    expect(body.content).toContain('http://localhost:4747');
    const embed = (body.embeds as Array<Record<string, unknown>>)[0];
    expect(embed).toMatchObject({ title: 'Permissão necessária', description: 'Bash: git push origin main', color: 0xe06c75, timestamp: new Date(AT).toISOString() });
    expect(embed.fields).toEqual([
      { name: 'Agente', value: 'Rafael', inline: true },
      { name: 'Ferramenta', value: 'Bash', inline: true },
    ]);
  });

  it('Discord sem agente/ferramenta: não inventa campos vazios', async () => {
    const fetchFn = fakeFetch();
    await sendWebhook({ url: 'https://discordapp.com/api/webhooks/1/2' }, { event: 'agent_error', title: 'Erro', text: 'Falhou' }, fetchFn as unknown as typeof fetch);
    const body = bodyOf(fetchFn.mock.calls[0]);
    expect(body.content).not.toContain('Agente:');
    expect(body.embeds).toEqual([{ title: 'Erro', description: 'Falhou', color: 0xe06c75, fields: [], timestamp: expect.any(String) }]);
  });

  it('Slack: um único "text" em mrkdwn, sem embeds', async () => {
    const fetchFn = fakeFetch();
    await sendWebhook({ url: 'https://hooks.slack.com/services/1/2/3' }, payload, fetchFn as unknown as typeof fetch);
    const body = bodyOf(fetchFn.mock.calls[0]);
    expect(body.embeds).toBeUndefined();
    expect(body.text).toBe('🚨 *HabbAI: Permissão necessária*\n*Agente:* Rafael\nBash: git push origin main');
  });

  it('Telegram: bot token na URL, chat_id, Markdown e o link do HabbAI', async () => {
    const fetchFn = fakeFetch();
    await expect(sendWebhook({ telegramToken: 'secret/tok', telegramChatId: '12345' }, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botsecret%2Ftok/sendMessage');
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: '12345',
      text: '🚨 *HabbAI: Permissão necessária*\n*Agente:* Rafael\nBash: git push origin main\n[Abrir HabbAI](http://localhost:4747)',
      parse_mode: 'Markdown',
    });
  });

  it('Telegram só com um dos dois campos configurados: não envia', async () => {
    const onlyToken = fakeFetch();
    await sendWebhook({ telegramToken: 'tok' }, payload, onlyToken as unknown as typeof fetch);
    expect(onlyToken).not.toHaveBeenCalled();
    const onlyChat = fakeFetch();
    await sendWebhook({ telegramChatId: '123' }, payload, onlyChat as unknown as typeof fetch);
    expect(onlyChat).not.toHaveBeenCalled();
  });
});

describe('falhas não derrubam o pedido', () => {
  it('HTTP de erro: ok: false, sem exceção', async () => {
    const fetchFn = fakeFetch(500);
    await expect(sendWebhook({ url: 'https://example.test/hook' }, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('erro de rede: ok: false, sem exceção', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    await expect(sendWebhook({ url: 'https://example.test/hook' }, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('dois canais: um falhando não impede o outro; ok: true se algum saiu', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('discord')) throw new Error('sem rede');
      return new Response('{}', { status: 200 });
    });
    const cfg = { url: 'https://discord.com/api/webhooks/1/2', telegramToken: 'tok', telegramChatId: '123' };
    await expect(sendWebhook(cfg, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('os dois canais falhando: ok: false (o chamador decide o que fazer)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('sem rede');
    });
    const cfg = { url: 'https://example.test/hook', telegramToken: 'tok', telegramChatId: '123' };
    await expect(sendWebhook(cfg, payload, fetchFn as unknown as typeof fetch)).resolves.toEqual({ ok: false });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
