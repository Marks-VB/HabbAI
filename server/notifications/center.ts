// Liga a central de notificações ao que acontece no escritório: grava o item no histórico e, quando o alerta externo
// (webhook/Telegram) faz sentido, respeita as preferências, o horário de silêncio e o modo "só na janela do app".
// O webhook em si continua em webhook.ts (aqui só chamamos): nada de rede quando não está configurado.
import { basename } from '../../shared/activity';
import type { NotificationItem, PermissionRequestInfo } from '../../shared/types';
import { tr } from '../../shared/i18n';
import { notificationAllowed, type NotificationPrefsStore } from './prefs';
import type { NotificationInbox, NotificationInput } from './inbox';
import { sendWebhook, type WebhookConfig, type WebhookPayload } from './webhook';

/** Quem pediu a atenção (o que o escritório já sabe do agente). */
export interface NotificationWho {
  id?: string;
  name?: string;
  account?: string;
}

export interface NotificationCenterOptions {
  inbox: NotificationInbox;
  prefs: NotificationPrefsStore;
  /** Webhook/Telegram (loadWebhookConfig); ausente ou vazio = só o histórico local. */
  webhook?: WebhookConfig;
  /** Páginas locais abertas (Hub.localSize): decide o modo "só na janela do app". */
  viewers?: () => number;
  /** Endereço do app nos alertas externos. */
  url?: string;
  /** fetch injetável nos testes; o padrão é o global. */
  fetchFn?: typeof fetch;
  /** Relógio injetável (testes). */
  now?: () => number;
}

/**
 * Central de notificações do servidor. O item entra sempre no histórico (mesmo com o tipo desligado ou durante o
 * silêncio); as preferências decidem apenas se o alerta externo sai. Sessão encerrada resolve os itens abertos do
 * agente antes de entrar ela mesma na lista.
 */
export class NotificationCenter {
  private readonly inbox: NotificationInbox;
  private readonly prefs: NotificationPrefsStore;
  private readonly webhook?: WebhookConfig;
  private readonly viewers?: () => number;
  private readonly url?: string;
  private readonly fetchFn?: typeof fetch;
  private readonly now: () => number;

  constructor(opts: NotificationCenterOptions) {
    this.inbox = opts.inbox;
    this.prefs = opts.prefs;
    this.webhook = opts.webhook;
    this.viewers = opts.viewers;
    this.url = opts.url;
    this.fetchFn = opts.fetchFn;
    this.now = opts.now ?? Date.now;
  }

  /** Grava um item e, se `alert` vier, decide se ele sai para o webhook/Telegram. */
  notify(input: NotificationInput, alert?: WebhookPayload): NotificationItem {
    const item = this.inbox.record(input);
    if (alert) this.dispatch(item, alert);
    return item;
  }

  /** Pedido de permissão ou pergunta do hook: histórico curto (sem o comando inteiro) e alerta externo igual ao de antes. */
  permission(info: PermissionRequestInfo, who: NotificationWho, project?: string): NotificationItem {
    const name = who.name ?? tr('Um agente');
    const question = !!info.questions?.length;
    const input: NotificationInput = {
      type: question ? 'question' : 'permission',
      agentId: who.id,
      agentName: who.name,
      account: who.account,
      project,
      tool: info.tool,
      title: question ? tr('{0} tem uma pergunta', [name]) : tr('{0} pede permissão', [name]),
      // Só um resumo: o texto completo (comando, diff, prompt) fica no cartão do pedido, nunca no arquivo.
      summary: question ? info.questions!.map((q) => q.question).join(' · ') : info.title,
      at: info.createdAt,
    };
    // O alerta externo mantém o payload que o webhook já mandava antes da central.
    return this.notify(input, {
      event: 'permission_request',
      agentName: who.name,
      title: info.title,
      text: info.text,
      tool: info.tool,
      url: this.url,
      timestamp: info.createdAt,
    });
  }

  /** Fim de sessão: resolve o que ficou aberto para o agente e registra o aviso (o webhook não cobre este evento). */
  sessionEnd(who: NotificationWho, project?: string): NotificationItem {
    if (who.id) this.inbox.resolveAgent(who.id);
    return this.notify({
      type: 'session-end',
      agentId: who.id,
      agentName: who.name,
      account: who.account,
      project,
      title: tr('{0} encerrou a sessão', [who.name ?? tr('Um agente')]),
      summary: project ? tr('Sessão encerrada em {0}', [basename(project)]) : undefined,
    });
  }

  private dispatch(item: NotificationItem, alert: WebhookPayload): void {
    const cfg = this.webhook;
    if (!cfg || (!cfg.url && !(cfg.telegramToken && cfg.telegramChatId))) return;
    const prefs = this.prefs.get();
    if (!notificationAllowed(prefs, item, item.at)) return;
    if (prefs.appWindowOnly && (this.viewers?.() ?? 1) <= 0) return;
    void sendWebhook(cfg, alert, this.fetchFn);
  }
}
