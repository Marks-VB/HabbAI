// Central de notificações: histórico curto e local do que pediu a sua atenção (permissão, pergunta, fim de sessão).
// O arquivo ~/.habblaud/notifications.json guarda só o que a interface mostra: nunca prompts, comandos ou diffs
// completos, e todo texto passa por maskSecrets antes de ser cortado. Escrita atômica (temporário + rename) e
// histórico limitado: os itens mais antigos saem sozinhos. Sem dependências de runtime e sem rede.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { maskSecrets, truncate } from '../../shared/activity';
import type { NotificationItem, NotificationStatus, NotificationType } from '../../shared/types';
import { log } from '../log';

/** Itens guardados por padrão (o mais antigo sai quando chega um novo). */
export const NOTIFICATION_LIMIT = 200;
/** Teto de itens guardados no arquivo (o construtor aceita outro, limitado aqui). */
export const NOTIFICATION_LIMIT_MAX = 500;
const MAX_FILE_BYTES = 1_024 * 1_024;
const MAX_ID = 80;
const MAX_TITLE = 120;
const MAX_SUMMARY = 180;
const MAX_FIELD = 240;
const FILE_VERSION = 1;

const TYPES: readonly NotificationType[] = ['permission', 'question', 'session-end', 'waiting'];
const STATUSES: readonly NotificationStatus[] = ['new', 'read', 'resolved'];

export type NotificationFilter = 'all' | 'unread';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  /** Resumo curto e já sem segredos; passa por maskSecrets e truncate de novo aqui. */
  summary?: string;
  at?: number;
  agentId?: string;
  agentName?: string;
  account?: string;
  project?: string;
  tool?: string;
}

export interface NotificationList {
  notifications: NotificationItem[];
  /** Itens novos (status 'new') no histórico inteiro. */
  unread: number;
  /** Itens no histórico (antes do filtro). */
  total: number;
}

function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return truncate(maskSecrets(v.replace(/\r/g, '')), max);
}

function optional(v: unknown, max = MAX_FIELD): string | undefined {
  const s = text(v, max);
  return s || undefined;
}

function isType(v: unknown): v is NotificationType {
  return typeof v === 'string' && (TYPES as readonly string[]).includes(v);
}

function isStatus(v: unknown): v is NotificationStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Um item lido do arquivo (ou de uma resposta antiga): campos fora do formato são descartados. */
export function parseNotificationItem(raw: unknown): NotificationItem | undefined {
  if (!isRecord(raw)) return undefined;
  const id = text(raw.id, MAX_ID);
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : undefined;
  const title = text(raw.title, MAX_TITLE);
  if (!id || at === undefined || !title || !isType(raw.type) || !isStatus(raw.status)) return undefined;
  const item: NotificationItem = { id, at, type: raw.type, status: raw.status, title };
  const summary = optional(raw.summary, MAX_SUMMARY);
  if (summary) item.summary = summary;
  // Só agentes e salas: os nomes são os que a interface já mostra no escritório.
  const agentId = optional(raw.agentId);
  const agentName = optional(raw.agentName, MAX_TITLE);
  const account = optional(raw.account);
  const project = optional(raw.project);
  const tool = optional(raw.tool);
  if (agentId) item.agentId = agentId;
  if (agentName) item.agentName = agentName;
  if (account) item.account = account;
  if (project) item.project = project;
  if (tool) item.tool = tool;
  return item;
}

/** JSON do arquivo: só os campos conhecidos, na ordem da lista. */
function toJson(items: readonly NotificationItem[]): string {
  return JSON.stringify({ version: FILE_VERSION, items });
}

export interface NotificationInboxOptions {
  /** Relógio injetável (testes). */
  now?: () => number;
  /** Itens guardados (padrão NOTIFICATION_LIMIT, teto NOTIFICATION_LIMIT_MAX). */
  limit?: number;
}

/**
 * Histórico em memória com persistência em arquivo. Uma instância por servidor; `load()` é chamado no boot, antes de
 * qualquer gravação (sem ele, o primeiro item novo sobrescreveria o histórico anterior).
 */
export class NotificationInbox {
  private items: NotificationItem[] = [];
  private seq = 0;
  private writes = 0;
  private readonly limit: number;
  private readonly now: () => number;

  constructor(
    private readonly file?: string,
    opts: NotificationInboxOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    const limit = opts.limit ?? NOTIFICATION_LIMIT;
    this.limit = Number.isFinite(limit)
      ? Math.max(1, Math.min(NOTIFICATION_LIMIT_MAX, Math.floor(limit)))
      : NOTIFICATION_LIMIT;
  }

  /** Carrega o histórico do arquivo. Arquivo ausente, corrompido ou grande demais = histórico vazio. */
  load(): void {
    if (!this.file) return;
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        log.warnOnce(
          'notifications-load',
          `Não foi possível ler o histórico de notificações: ${(err as NodeJS.ErrnoException).code ?? 'erro'}`,
        );
      return;
    }
    if (raw.length > MAX_FILE_BYTES) {
      log.warnOnce('notifications-load-size', 'O histórico de notificações é grande demais: começando vazio');
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      log.warnOnce('notifications-load-json', 'O histórico de notificações está corrompido: começando vazio');
      return;
    }
    const list = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : [];
    const parsed = list.map(parseNotificationItem).filter((n): n is NotificationItem => !!n);
    parsed.sort((a, b) => b.at - a.at);
    this.items = parsed.slice(0, this.limit);
    this.seq = parsed.length;
  }

  /** Grava um item novo (no começo da lista) e persiste. O histórico nunca passa do limite. */
  record(input: NotificationInput): NotificationItem {
    const now = this.now();
    const at = typeof input.at === 'number' && Number.isFinite(input.at) ? input.at : now;
    const type = isType(input.type) ? input.type : 'waiting';
    const title = text(input.title, MAX_TITLE) || type;
    const id = `n-${now.toString(36)}-${(++this.seq).toString(36)}-${randomBytes(4).toString('hex')}`;
    const item: NotificationItem = { id, at, type, status: 'new', title };
    const summary = optional(input.summary, MAX_SUMMARY);
    if (summary) item.summary = summary;
    const agentId = optional(input.agentId);
    const agentName = optional(input.agentName, MAX_TITLE);
    const account = optional(input.account);
    const project = optional(input.project);
    const tool = optional(input.tool);
    if (agentId) item.agentId = agentId;
    if (agentName) item.agentName = agentName;
    if (account) item.account = account;
    if (project) item.project = project;
    if (tool) item.tool = tool;
    this.items.unshift(item);
    if (this.items.length > this.limit) this.items.length = this.limit;
    this.save();
    return item;
  }

  /** Lista (mais novo primeiro), com o filtro e um teto de itens. `unread` conta o histórico inteiro. */
  list(opts: { filter?: NotificationFilter; limit?: number } = {}): NotificationList {
    const filter = opts.filter === 'unread' ? 'unread' : 'all';
    const limit =
      typeof opts.limit === 'number' && Number.isFinite(opts.limit)
        ? Math.max(1, Math.min(this.limit, Math.floor(opts.limit)))
        : this.limit;
    const shown = filter === 'unread' ? this.items.filter((n) => n.status === 'new') : this.items;
    return { notifications: shown.slice(0, limit), unread: this.countUnread(), total: this.items.length };
  }

  /** Marca um item como lido (um resolvido continua resolvido). undefined = id desconhecido. */
  markRead(id: string): NotificationStatus | undefined {
    const item = this.items.find((n) => n.id === id);
    if (!item) return undefined;
    if (item.status === 'new') {
      item.status = 'read';
      this.save();
    }
    return item.status;
  }

  /** Marca todos os novos como lidos; devolve quantos mudaram. */
  markAllRead(): number {
    let changed = 0;
    for (const item of this.items) {
      if (item.status !== 'new') continue;
      item.status = 'read';
      changed++;
    }
    if (changed) this.save();
    return changed;
  }

  /** Resolve um item (o assunto acabou); undefined = id desconhecido. */
  resolve(id: string): NotificationStatus | undefined {
    const item = this.items.find((n) => n.id === id);
    if (!item) return undefined;
    if (item.status !== 'resolved') {
      item.status = 'resolved';
      this.save();
    }
    return item.status;
  }

  /** Resolve os itens ainda abertos de um agente (ex.: a sessão dele terminou). */
  resolveAgent(agentId: string): number {
    let changed = 0;
    for (const item of this.items) {
      if (item.agentId !== agentId || item.status === 'resolved') continue;
      item.status = 'resolved';
      changed++;
    }
    if (changed) this.save();
    return changed;
  }

  /** Itens novos no histórico inteiro. */
  countUnread(): number {
    return this.items.filter((n) => n.status === 'new').length;
  }

  /** Cópia do histórico (testes e diagnóstico). */
  all(): NotificationItem[] {
    return this.items.map((n) => ({ ...n }));
  }

  private save(): void {
    if (!this.file) return;
    const tmp = `${this.file}.${process.pid}.${++this.writes}.tmp`;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(tmp, toJson(this.items), { encoding: 'utf8', mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        // o temporário nem chegou a existir
      }
      log.warnOnce(
        'notifications-save',
        `Não foi possível guardar o histórico de notificações: ${(err as NodeJS.ErrnoException).code ?? 'erro'}`,
      );
    }
  }
}
