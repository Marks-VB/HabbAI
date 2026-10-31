import { describe, expect, it } from 'vitest';
import { loadWebhookConfig, sendWebhook, type WebhookPayload } from './webhook';

describe('webhook notifications', () => {
  it('loadWebhookConfig carrega URLs do ambiente', () => {
    const cfg = loadWebhookConfig({
      HABBLAUD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc',
      HABBLAUD_TELEGRAM_BOT_TOKEN: 'tok123',
      HABBLAUD_TELEGRAM_CHAT_ID: 'chat456',
    });
    expect(cfg.url).toBe('https://discord.com/api/webhooks/123/abc');
    expect(cfg.telegramToken).toBe('tok123');
    expect(cfg.telegramChatId).toBe('chat456');
  });

  it('formata payload para Discord', async () => {
    let sentBody: string | undefined;
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response('{}', { status: 200 });
    };

    const payload: WebhookPayload = {
      event: 'permission_request',
      agentName: 'Rafael',
      title: 'Permissão necessária',
      text: 'Bash: git push origin main',
      tool: 'Bash',
    };

    const res = await sendWebhook({ url: 'https://discord.com/api/webhooks/1/2' }, payload, fakeFetch as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    expect(sentBody).toBeDefined();
    const parsed = JSON.parse(sentBody!);
    expect(parsed.content).toContain('Rafael');
    expect(parsed.embeds).toHaveLength(1);
    expect(parsed.embeds[0].title).toBe('Permissão necessária');
  });

  it('formata payload para Slack', async () => {
    let sentBody: string | undefined;
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response('{}', { status: 200 });
    };

    const payload: WebhookPayload = {
      event: 'permission_request',
      agentName: 'Marina',
      title: 'Permissão necessária',
      text: 'Bash: rm -rf dist',
    };

    const res = await sendWebhook({ url: 'https://hooks.slack.com/services/1/2/3' }, payload, fakeFetch as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(sentBody!);
    expect(parsed.text).toContain('Marina');
  });

  it('envia para o Telegram Bot quando configurado', async () => {
    let sentUrl: string | undefined;
    let sentBody: string | undefined;
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      sentUrl = String(url);
      sentBody = String(init?.body);
      return new Response('{}', { status: 200 });
    };

    const payload: WebhookPayload = {
      event: 'permission_request',
      agentName: 'Gustavo',
      title: 'Aprovação de comando',
      text: 'npm test',
    };

    const res = await sendWebhook({ telegramToken: 'secret_tok', telegramChatId: '12345' }, payload, fakeFetch as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    expect(sentUrl).toContain('https://api.telegram.org/botsecret_tok/sendMessage');
    const parsed = JSON.parse(sentBody!);
    expect(parsed.chat_id).toBe('12345');
    expect(parsed.text).toContain('Gustavo');
  });
});
