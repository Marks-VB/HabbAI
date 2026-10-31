// Preferências da central de notificações: por tipo, por projeto/conta/ferramenta, horário de silêncio e o modo "só na
// janela do app". Persistidas em ~/.habblaud/notifications-prefs.json com escrita atômica. O histórico continua sendo
// gravado mesmo com um tipo desligado ou durante o silêncio: o que estas regras decidem é o alerta externo
// (webhook/Telegram). Sem rede e sem dependências de runtime.
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NotificationPrefs, NotificationQuietHours, NotificationType } from '../../shared/types';
import { log } from '../log';

export const NOTIFICATION_TYPES: readonly NotificationType[] = ['permission', 'question', 'session-end', 'waiting'];
export const DEFAULT_QUIET_START = '22:00';
export const DEFAULT_QUIET_END = '07:00';
/** Regras por projeto/conta/ferramenta guardadas no arquivo. */
export const MAX_RULES = 100;
const MAX_RULE_LENGTH = 200;
const MAX_FILE_BYTES = 256 * 1_024;
const FILE_VERSION = 1;

/** Preferências padrão (novo objeto: o chamador pode alterar sem afetar as outras instâncias). */
export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    types: { permission: true, question: true, 'session-end': true, waiting: true },
    quiet: { enabled: false, start: DEFAULT_QUIET_START, end: DEFAULT_QUIET_END },
    appWindowOnly: false,
    projects: {},
    accounts: {},
    tools: {},
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** "HH:MM" (00:00 a 23:59) em minutos desde a meia-noite; undefined se não for um horário válido. */
export function parseClock(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutos desde a meia-noite no fuso local do servidor. */
export function minutesOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Está no horário de silêncio? A janela atravessa a meia-noite quando o início é maior que o fim (22:00 → 07:00).
 * Início igual ao fim = nunca (não é "o dia inteiro").
 */
export function isQuietAt(quiet: NotificationQuietHours, at: number): boolean {
  if (!quiet.enabled) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === undefined || end === undefined || start === end) return false;
  const now = minutesOfDay(at);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** O que as regras precisam saber de um item para decidir o alerta externo. */
export interface NotificationFilterInput {
  type: NotificationType;
  project?: string;
  account?: string;
  tool?: string;
}

function ruleAllows(rules: Record<string, boolean>, key: string | undefined): boolean {
  return !key || rules[key] !== false;
}

/**
 * O alerta externo deste item é permitido? Tipo ligado, nenhuma regra `false` para o projeto/conta/ferramenta e fora
 * do horário de silêncio.
 */
export function notificationAllowed(prefs: NotificationPrefs, item: NotificationFilterInput, at: number): boolean {
  if (!prefs.types[item.type]) return false;
  if (!ruleAllows(prefs.projects, item.project)) return false;
  if (!ruleAllows(prefs.accounts, item.account)) return false;
  if (!ruleAllows(prefs.tools, item.tool)) return false;
  return !isQuietAt(prefs.quiet, at);
}

/** Lê um mapa de regras tolerante (arquivo corrompido ou de uma versão antiga). */
function readRules(raw: unknown): Record<string, boolean> {
  if (!isRecord(raw)) return {};
  const out: Record<string, boolean> = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (n >= MAX_RULES) break;
    const k = key.trim();
    if (!k || k.length > MAX_RULE_LENGTH || typeof value !== 'boolean') continue;
    out[k] = value;
    n++;
  }
  return out;
}

/** Valida um objeto vindo do PUT /api/notifications/prefs (estrito). */
function readRulesStrict(raw: unknown): Record<string, boolean> | undefined {
  if (!isRecord(raw)) return undefined;
  const entries = Object.entries(raw);
  if (entries.length > MAX_RULES) return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, value] of entries) {
    const k = key.trim();
    if (!k || k.length > MAX_RULE_LENGTH || typeof value !== 'boolean') return undefined;
    out[k] = value;
  }
  return out;
}

/** Preferências saneadas do arquivo: campo inválido cai no padrão, nunca derruba o boot. */
export function sanitizePrefs(raw: unknown): NotificationPrefs {
  const out = defaultNotificationPrefs();
  if (!isRecord(raw)) return out;
  if (isRecord(raw.types)) {
    for (const type of NOTIFICATION_TYPES) {
      if (typeof raw.types[type] === 'boolean') out.types[type] = raw.types[type];
    }
  }
  if (isRecord(raw.quiet)) {
    if (typeof raw.quiet.enabled === 'boolean') out.quiet.enabled = raw.quiet.enabled;
    const start = parseClock(raw.quiet.start);
    const end = parseClock(raw.quiet.end);
    if (start !== undefined) out.quiet.start = raw.quiet.start as string;
    if (end !== undefined) out.quiet.end = raw.quiet.end as string;
  }
  if (typeof raw.appWindowOnly === 'boolean') out.appWindowOnly = raw.appWindowOnly;
  out.projects = readRules(raw.projects);
  out.accounts = readRules(raw.accounts);
  out.tools = readRules(raw.tools);
  return out;
}

/**
 * Aplica um PUT parcial sobre as preferências atuais. Devolve undefined quando o corpo não é um objeto com os campos
 * conhecidos e os tipos certos (a rota responde 400). Campos ausentes ficam como estão.
 */
export function parsePrefsPatch(
  raw: unknown,
  current: NotificationPrefs = defaultNotificationPrefs(),
): NotificationPrefs | undefined {
  if (!isRecord(raw)) return undefined;
  const allowed = new Set(['types', 'quiet', 'appWindowOnly', 'projects', 'accounts', 'tools']);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) return undefined;
  const out = sanitizePrefs(current);
  if ('types' in raw) {
    if (!isRecord(raw.types)) return undefined;
    for (const [key, value] of Object.entries(raw.types)) {
      if (!(NOTIFICATION_TYPES as readonly string[]).includes(key) || typeof value !== 'boolean') return undefined;
    }
    for (const type of NOTIFICATION_TYPES) {
      if (typeof raw.types[type] === 'boolean') out.types[type] = raw.types[type];
    }
  }
  if ('quiet' in raw) {
    const quiet = raw.quiet;
    if (!isRecord(quiet)) return undefined;
    if ('enabled' in quiet) {
      if (typeof quiet.enabled !== 'boolean') return undefined;
      out.quiet.enabled = quiet.enabled;
    }
    if ('start' in quiet) {
      if (parseClock(quiet.start) === undefined) return undefined;
      out.quiet.start = quiet.start as string;
    }
    if ('end' in quiet) {
      if (parseClock(quiet.end) === undefined) return undefined;
      out.quiet.end = quiet.end as string;
    }
  }
  if ('appWindowOnly' in raw) {
    if (typeof raw.appWindowOnly !== 'boolean') return undefined;
    out.appWindowOnly = raw.appWindowOnly;
  }
  for (const key of ['projects', 'accounts', 'tools'] as const) {
    if (!(key in raw)) continue;
    const rules = readRulesStrict(raw[key]);
    if (!rules) return undefined;
    out[key] = rules;
  }
  return out;
}

/** Preferências em memória com persistência em arquivo (escrita atômica). */
export class NotificationPrefsStore {
  private prefs: NotificationPrefs = defaultNotificationPrefs();
  private writes = 0;

  constructor(private readonly file?: string) {}

  /** Lê o arquivo (ausente ou corrompido = padrões). */
  load(): void {
    if (!this.file) return;
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        log.warnOnce(
          'notification-prefs-load',
          `Não foi possível ler as preferências de notificação: ${(err as NodeJS.ErrnoException).code ?? 'erro'}`,
        );
      return;
    }
    if (raw.length > MAX_FILE_BYTES) {
      log.warnOnce('notification-prefs-size', 'As preferências de notificação são grandes demais: usando os padrões');
      return;
    }
    try {
      this.prefs = sanitizePrefs(JSON.parse(raw));
    } catch {
      log.warnOnce('notification-prefs-json', 'As preferências de notificação estão corrompidas: usando os padrões');
    }
  }

  get(): NotificationPrefs {
    return this.prefs;
  }

  /** Grava preferências já validadas (savePrefs) e devolve o que ficou guardado. */
  set(prefs: NotificationPrefs): NotificationPrefs {
    this.prefs = sanitizePrefs(prefs);
    this.save();
    return this.prefs;
  }

  private save(): void {
    if (!this.file) return;
    const tmp = `${this.file}.${process.pid}.${++this.writes}.tmp`;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, ...this.prefs }), { encoding: 'utf8', mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        // o temporário nem chegou a existir
      }
      log.warnOnce(
        'notification-prefs-save',
        `Não foi possível guardar as preferências de notificação: ${(err as NodeJS.ErrnoException).code ?? 'erro'}`,
      );
    }
  }
}
