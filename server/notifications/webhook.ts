// Notificações por Webhook (Discord / Slack / Telegram / webhook genérico):
// Dispara alertas externos quando um agente precisa de aprovação de permissão ou relata erro crítico.
import { errMsg, log } from '../log';

export interface WebhookConfig {
  url?: string;
  telegramToken?: string;
  telegramChatId?: string;
}

export function loadWebhookConfig(env: NodeJS.ProcessEnv = process.env): WebhookConfig {
  return {
    url: env.HABBLAUD_WEBHOOK_URL?.trim() || undefined,
    telegramToken: env.HABBLAUD_TELEGRAM_BOT_TOKEN?.trim() || undefined,
    telegramChatId: env.HABBLAUD_TELEGRAM_CHAT_ID?.trim() || undefined,
  };
}

export interface WebhookPayload {
  event: 'permission_request' | 'agent_error';
  agentName?: string;
  title: string;
  text: string;
  tool?: string;
  url?: string;
  timestamp?: number;
}

export async function sendWebhook(
  cfg: WebhookConfig,
  payload: WebhookPayload,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  let anySent = false;

  // 1. Webhook HTTP (Discord, Slack, ou genérico)
  if (cfg.url) {
    try {
      const isDiscord = /discord(?:app)?\.com\/api\/webhooks/i.test(cfg.url);
      const isSlack = /hooks\.slack\.com/i.test(cfg.url);

      let body: string;
      if (isDiscord) {
        body = JSON.stringify({
          content: `🚨 **HabbAI: ${payload.title}**\n${payload.agentName ? `**Agente:** ${payload.agentName}\n` : ''}${payload.text}\n${payload.url ? `🔗 ${payload.url}` : ''}`,
          embeds: [
            {
              title: payload.title,
              description: payload.text,
              color: 0xe06c75,
              fields: [
                ...(payload.agentName ? [{ name: 'Agente', value: payload.agentName, inline: true }] : []),
                ...(payload.tool ? [{ name: 'Ferramenta', value: payload.tool, inline: true }] : []),
              ],
              timestamp: new Date(payload.timestamp ?? Date.now()).toISOString(),
            },
          ],
        });
      } else if (isSlack) {
        body = JSON.stringify({
          text: `🚨 *HabbAI: ${payload.title}*\n${payload.agentName ? `*Agente:* ${payload.agentName}\n` : ''}${payload.text}`,
        });
      } else {
        body = JSON.stringify(payload);
      }

      const res = await fetchFn(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) anySent = true;
      else log.warnOnce(`webhook-err-${res.status}`, `Webhook retornou HTTP ${res.status}`);
    } catch (err) {
      log.warnOnce(`webhook-fail-${errMsg(err)}`, `Falha ao disparar webhook: ${errMsg(err)}`);
    }
  }

  // 2. Telegram Bot
  if (cfg.telegramToken && cfg.telegramChatId) {
    try {
      const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(cfg.telegramToken)}/sendMessage`;
      const msg = `🚨 *HabbAI: ${payload.title}*\n${payload.agentName ? `*Agente:* ${payload.agentName}\n` : ''}${payload.text}\n${payload.url ? `[Abrir HabbAI](${payload.url})` : ''}`;
      const res = await fetchFn(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text: msg,
          parse_mode: 'Markdown',
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) anySent = true;
    } catch (err) {
      log.warnOnce(`tg-fail-${errMsg(err)}`, `Falha ao enviar mensagem Telegram: ${errMsg(err)}`);
    }
  }

  return { ok: anySent };
}
