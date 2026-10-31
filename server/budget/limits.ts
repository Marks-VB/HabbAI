// Limites de orçamento persistidos em <dataDir>/budget.json (sem HABBLAUD_DATA_DIR, ~/.habblaud/budget.json).
//
// A leitura é defensiva (arquivo ausente, truncado, editado à mão ou de outra versão nunca derrubam o servidor:
// ficam os limites vazios e um aviso no log) e a gravação é atômica (tmp + rename). A validação é rígida: só números
// finitos e >= 0 dentro dos máximos, ids de tamanho limitado, nenhum campo desconhecido — um erro de digitação no
// arquivo vira aviso, não um limite silenciosamente diferente do que foi escrito.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { copyBudgetConfig, emptyBudgetConfig, type BudgetConfig, type BudgetLimit, type BudgetScopeLimits } from '../../shared/budget';
import { tr } from '../../shared/i18n';
import { errMsg, log } from '../log';

/** Tamanho máximo do arquivo lido (o arquivo real tem alguns KB). */
export const BUDGET_FILE_MAX = 256 * 1024;
/** Máximo do custo por período, em dólares (protege contra um número absurdo digitado por engano). */
export const MAX_LIMIT_COST = 1_000_000;
/** Máximo de tokens por período. */
export const MAX_LIMIT_TOKENS = 1_000_000_000_000_000;
/** Escopos (projetos + contas) aceitos na configuração. */
export const MAX_SCOPES = 100;
/** Tamanho máximo de um id de projeto ou de conta. */
export const MAX_SCOPE_ID = 1_024;

const TOP_KEYS = new Set(['version', 'limits', 'projects', 'accounts']);
const PERIOD_KEYS = new Set(['day', 'month']);
const LIMIT_KEYS = new Set(['costUSD', 'tokens']);
/** Chaves que, num objeto usado como mapa, mexem no protótipo. */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Objeto simples (não array, não null). */
function plain(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function objectAt(where: string): { ok: false; error: string } {
  return fail(tr('esperado um objeto em {0}', [where]));
}

function amount(v: unknown, max: number, where: string, integer: boolean): Parsed<number> {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fail(tr('limite inválido em {0}: use um número finito e maior ou igual a zero', [where]));
  if (v > max) return fail(tr('valor acima do máximo em {0} (máximo: {1})', [where, max]));
  if (integer && !Number.isInteger(v)) return fail(tr('use um número inteiro em {0}', [where]));
  return { ok: true, value: Object.is(v, -0) ? 0 : v };
}

/** `{ costUSD?, tokens? }` — vazio não vale: um período sem métrica não teria o que avisar. */
function parseLimit(raw: unknown, where: string): Parsed<BudgetLimit> {
  const o = plain(raw);
  if (!o) return objectAt(where);
  const keys = Object.keys(o);
  if (!keys.length) return fail(tr('informe costUSD e/ou tokens em {0}', [where]));
  for (const key of keys) if (!LIMIT_KEYS.has(key)) return fail(tr('campo desconhecido em {0}: "{1}"', [where, key]));
  const out: BudgetLimit = {};
  if (o.costUSD !== undefined) {
    const r = amount(o.costUSD, MAX_LIMIT_COST, `${where}.costUSD`, false);
    if (!r.ok) return r;
    out.costUSD = r.value;
  }
  if (o.tokens !== undefined) {
    const r = amount(o.tokens, MAX_LIMIT_TOKENS, `${where}.tokens`, true);
    if (!r.ok) return r;
    out.tokens = r.value;
  }
  return { ok: true, value: out };
}

/** `{ day?, month? }` — nenhum dos dois também vale (escopo sem limite). */
export function parseScopeLimits(raw: unknown, where: string): Parsed<BudgetScopeLimits> {
  if (raw === undefined) return { ok: true, value: {} };
  const o = plain(raw);
  if (!o) return objectAt(where);
  for (const key of Object.keys(o)) if (!PERIOD_KEYS.has(key)) return fail(tr('campo desconhecido em {0}: "{1}"', [where, key]));
  const out: BudgetScopeLimits = {};
  for (const period of ['day', 'month'] as const) {
    if (o[period] === undefined) continue;
    const r = parseLimit(o[period], `${where}.${period}`);
    if (!r.ok) return r;
    out[period] = r.value;
  }
  return { ok: true, value: out };
}

function parseScopeMap(raw: unknown, where: 'projects' | 'accounts'): Parsed<Record<string, BudgetScopeLimits> | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const o = plain(raw);
  if (!o) return objectAt(where);
  const ids = Object.keys(o);
  if (ids.length > MAX_SCOPES) return fail(tr('escopos demais em {0} (máximo: {1})', [where, MAX_SCOPES]));
  const out = Object.create(null) as Record<string, BudgetScopeLimits>;
  for (const id of ids) {
    if (!id.length || id.length > MAX_SCOPE_ID) return fail(tr('id inválido em {0}: use um texto de 1 a {1} caracteres', [where, MAX_SCOPE_ID]));
    if (RESERVED_KEYS.has(id)) return fail(tr('id reservado em {0}: "{1}"', [where, id]));
    const r = parseScopeLimits(o[id], `${where}.${id}`);
    if (!r.ok) return r;
    // Um escopo sem nenhum limite é quase sempre um erro de digitação ou uma sobra: melhor recusar.
    if (!r.value.day && !r.value.month) return fail(tr('informe um limite diário ou mensal em {0}', [`${where}.${id}`]));
    out[id] = r.value;
  }
  return { ok: true, value: out };
}

/**
 * Valida e normaliza o corpo de PUT /api/budget (o mesmo formato do budget.json). A versão pode vir ausente
 * (assume 1); qualquer outra versão é recusada, para um arquivo de outra geração não ser lido pela metade.
 */
export function parseBudgetConfig(raw: unknown): Parsed<BudgetConfig> {
  const o = plain(raw);
  if (!o) return objectAt('budget.json');
  for (const key of Object.keys(o)) if (!TOP_KEYS.has(key)) return fail(tr('campo desconhecido em {0}: "{1}"', ['budget.json', key]));
  if (o.version !== undefined && o.version !== 1) return fail(tr('versão de budget.json não suportada (esperado 1)'));
  const limits = parseScopeLimits(o.limits, 'limits');
  if (!limits.ok) return limits;
  const projects = parseScopeMap(o.projects, 'projects');
  if (!projects.ok) return projects;
  const accounts = parseScopeMap(o.accounts, 'accounts');
  if (!accounts.ok) return accounts;
  const config: BudgetConfig = { version: 1, limits: limits.value };
  if (projects.value) config.projects = projects.value;
  if (accounts.value) config.accounts = accounts.value;
  return { ok: true, value: config };
}

export type SaveResult = { ok: true; config: BudgetConfig } | { ok: false; error: string };

/**
 * Os limites em vigor. `file` null = só em memória (testes). O arquivo é a fonte da verdade: uma gravação que
 * falha mantém os limites anteriores em memória e devolve o motivo para a rota responder 400/erro.
 */
export class BudgetStore {
  private config: BudgetConfig = emptyBudgetConfig();

  constructor(readonly file: string | null) {}

  load(): void {
    if (!this.file) return;
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warnOnce('budget-read', tr('Não foi possível ler {0} ({1}); usando os limites vazios.', [this.file, errMsg(err)]));
      return;
    }
    if (raw.length > BUDGET_FILE_MAX) {
      log.warnOnce('budget-size', tr('{0} está grande demais; usando os limites vazios.', [this.file]));
      return;
    }
    let parsed: Parsed<BudgetConfig>;
    try {
      parsed = parseBudgetConfig(JSON.parse(raw));
    } catch {
      parsed = fail(tr('JSON inválido'));
    }
    if (!parsed.ok) {
      log.warnOnce('budget-corrupt', tr('{0} está ilegível ({1}); usando os limites vazios.', [this.file, parsed.error]));
      return;
    }
    this.config = parsed.value;
  }

  get(): BudgetConfig {
    return copyBudgetConfig(this.config);
  }

  save(raw: unknown): SaveResult {
    const parsed = parseBudgetConfig(raw);
    if (!parsed.ok) return parsed;
    const error = this.write(parsed.value);
    if (error) return { ok: false, error };
    this.config = parsed.value;
    return { ok: true, config: copyBudgetConfig(this.config) };
  }

  /** Grava a configuração; devolve o erro (texto para o usuário) ou undefined quando deu certo. */
  private write(config: BudgetConfig): string | undefined {
    if (!this.file) return undefined;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, this.file);
      log.clearOnce('budget-write');
      return undefined;
    } catch (err) {
      log.warnOnce('budget-write', tr('Não foi possível gravar {0} ({1}); os limites continuam os anteriores.', [this.file, errMsg(err)]));
      return tr('Não foi possível gravar os limites ({0}).', [errMsg(err)]);
    }
  }
}
