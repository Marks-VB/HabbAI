// Avaliação do orçamento a partir das estatísticas que o servidor já acumula (DayStatsService, history/daystats.ts):
// o gasto do dia vem de stats.day(hoje) e o do mês soma os dias do mês em stats.days(). Nada de estatística própria
// aqui — só a leitura por escopo (escritório, projeto, conta), o percentual e os avisos.
//
// Os marcos (80% e 100%) disparam uma vez por período e escopo. O que já foi avisado fica em
// <dataDir>/budget-alerts.json, então um reinício do servidor no mesmo dia não repete o aviso; a virada do dia (ou do
// mês) descarta os registros do período que terminou. Cada marco é entregue a `notify`, que o index liga ao webhook.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dayKeyOf } from '../../shared/daystats';
import {
  BUDGET_MILESTONES,
  copyBudgetConfig,
  type BudgetConfig,
  type BudgetMetric,
  type BudgetMetricState,
  type BudgetMilestone,
  type BudgetPeriod,
  type BudgetResponse,
  type BudgetScopeKind,
  type BudgetScopeLimits,
  type BudgetStatus,
} from '../../shared/budget';
import { tr } from '../../shared/i18n';
import { errMsg, log } from '../log';
import type { BudgetStore } from './limits';

/** Tamanho máximo do arquivo de avisos (é uma lista pequena de chaves). */
const ALERTS_FILE_MAX = 64 * 1024;
/** Avisos guardados por vez (o suficiente para o dia e o mês em todos os escopos). */
const MAX_FIRED = 500;

/** O mínimo que o rastreador precisa das estatísticas do dia — DayStatsService satisfaz esta forma. */
export interface BudgetUsageCounts {
  costUSD: number;
  tokensIn: number;
  tokensOut: number;
}

export interface BudgetUsageDay {
  totals: { counts: BudgetUsageCounts };
  rooms: ReadonlyArray<{ id: string; name: string; counts: BudgetUsageCounts }>;
  accounts: ReadonlyArray<{ id: string; name: string; counts: BudgetUsageCounts }>;
}

/** Fonte do gasto (o DayStatsService em produção; um mapa fixo nos testes). */
export interface BudgetStatsSource {
  /** Fuso em que os dias e os meses são cortados (o mesmo dos arquivos de estatística). */
  readonly tz: string;
  today(tz?: string): string;
  days(tz: string): { days: string[] };
  day(day: string, tz: string, source?: 'real' | 'demo'): { stats: BudgetUsageDay } | null;
}

/** Um aviso de marco (o index converte em webhook/Telegram). */
export interface BudgetAlert {
  milestone: BudgetMilestone;
  scope: BudgetScopeKind;
  id?: string;
  name?: string;
  period: BudgetPeriod;
  periodKey: string;
  metric: BudgetMetric;
  limit: number;
  used: number;
  percent: number;
  /** Relógio do servidor no momento do aviso (epoch ms). */
  timestamp: number;
}

export interface BudgetTrackerDeps {
  store: BudgetStore;
  stats: BudgetStatsSource;
  /** Chamado uma vez por marco, por período e escopo. */
  notify?: (alert: BudgetAlert) => void | Promise<void>;
  now?: () => number;
  /** Arquivo dos avisos já disparados; null = só em memória (testes). */
  alertFile?: string | null;
  /** Quanto tempo o gasto calculado vale (padrão 15 s; 0 = sempre recalcula). */
  cacheMs?: number;
}

interface Usage {
  costUSD: number;
  tokens: number;
}

interface Names {
  projects: Map<string, string>;
  accounts: Map<string, string>;
}

interface UsageSnapshot {
  dayKey: string;
  monthKey: string;
  at: number;
  day: Map<string, Usage>;
  month: Map<string, Usage>;
  names: Names;
}

const PERIODS: readonly BudgetPeriod[] = ['day', 'month'];
const SCOPES: readonly BudgetScopeKind[] = ['global', 'project', 'account'];

function zero(): Usage {
  return { costUSD: 0, tokens: 0 };
}

function scopeKey(scope: BudgetScopeKind, id?: string): string {
  return scope === 'global' ? 'global' : `${scope}:${id ?? ''}`;
}

function addUsage(map: Map<string, Usage>, key: string, o: BudgetUsageCounts): void {
  let u = map.get(key);
  if (!u) map.set(key, (u = zero()));
  u.costUSD += o.costUSD;
  u.tokens += o.tokensIn + o.tokensOut;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function percentOf(used: number, limit: number): number {
  if (limit > 0) return (used / limit) * 100;
  return used > 0 ? 100 : 0;
}

function exceededOf(used: number, limit: number): boolean {
  return limit > 0 ? used >= limit : used > 0;
}

/** Chave persistida de um aviso: período + escopo + métrica + marco. */
function alertKey(periodKey: string, scope: BudgetScopeKind, id: string | undefined, metric: BudgetMetric, milestone: BudgetMilestone): string {
  return `${periodKey}|${scopeKey(scope, id)}|${metric}|${milestone}`;
}

/** Só as chaves que ainda valem (o dia de hoje e o mês corrente). */
function keepKey(key: string, dayKey: string, monthKey: string): boolean {
  return key.startsWith(`${dayKey}|`) || key.startsWith(`${monthKey}|`);
}

export type BudgetSaveResult = { ok: true; response: BudgetResponse } | { ok: false; error: string };

/**
 * Estado do orçamento e disparo dos marcos. `get()` recalcula na hora (GET /api/budget) e `check()` é o mesmo
 * cálculo, para o relógio do servidor (start/stop). Os avisos nunca repetem dentro do período.
 */
export class BudgetTracker {
  private fired = new Map<string, number>();
  private snapshot: UsageSnapshot | null = null;
  private status: BudgetStatus | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly alertFile: string | null;
  private readonly cacheMs: number;

  constructor(private readonly deps: BudgetTrackerDeps) {
    this.now = deps.now ?? Date.now;
    this.alertFile = deps.alertFile ?? null;
    this.cacheMs = deps.cacheMs ?? 15_000;
    this.loadFired();
  }

  get config(): BudgetConfig {
    return copyBudgetConfig(this.deps.store.get());
  }

  /** Liga o relógio dos avisos (30 s por padrão). */
  start(intervalMs = 30_000): void {
    if (this.timer) return;
    this.check();
    this.timer = setInterval(() => this.safely(() => this.check()), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Somente lê o estado atual, sem disparar avisos (a última avaliação, ou uma agora). */
  statusOf(now = this.now()): BudgetStatus {
    return this.status ?? this.evaluate(now, false);
  }

  /** GET /api/budget: configuração + estado atual (os marcos novos são avisados aqui, uma vez só). */
  get(now = this.now()): BudgetResponse {
    return { config: this.config, status: this.check(now) };
  }

  /** PUT /api/budget: valida, grava e reavalia. */
  save(raw: unknown, now = this.now()): BudgetSaveResult {
    const r = this.deps.store.save(raw);
    if (!r.ok) return r;
    this.snapshot = null;
    return { ok: true, response: { config: r.config, status: this.check(now) } };
  }

  /** Avalia o gasto, dispara os marcos ainda não avisados e devolve o estado. */
  check(now = this.now()): BudgetStatus {
    return this.evaluate(now, true);
  }

  private evaluate(now: number, fire: boolean): BudgetStatus {
    const tz = this.deps.stats.tz;
    const dayKey = dayKeyOf(now, tz);
    const monthKey = dayKey.slice(0, 7);
    this.prune(dayKey, monthKey);
    const usage = this.usage(now, dayKey, monthKey);
    const config = this.deps.store.get();
    const metrics: BudgetMetricState[] = [];
    const push = (scope: BudgetScopeKind, id: string | undefined, limits: BudgetScopeLimits): void => {
      for (const period of PERIODS) {
        const limit = limits[period];
        if (!limit) continue;
        const used = (period === 'day' ? usage.day : usage.month).get(scopeKey(scope, id)) ?? zero();
        const periodKey = period === 'day' ? dayKey : monthKey;
        if (limit.costUSD !== undefined) metrics.push(this.metricState(scope, id, period, periodKey, 'costUSD', used.costUSD, limit.costUSD));
        if (limit.tokens !== undefined) metrics.push(this.metricState(scope, id, period, periodKey, 'tokens', used.tokens, limit.tokens));
      }
    };
    const nameOf = (scope: 'project' | 'account', id: string): string | undefined =>
      (scope === 'project' ? usage.names.projects : usage.names.accounts).get(id);
    const named = (scope: BudgetScopeKind, id: string | undefined): string | undefined => {
      if (!id || scope === 'global') return undefined;
      return nameOf(scope, id) ?? (scope === 'project' ? basename(id) : id);
    };
    push('global', undefined, config.limits);
    for (const [id, limits] of Object.entries(config.projects ?? {})) push('project', id, limits);
    for (const [id, limits] of Object.entries(config.accounts ?? {})) push('account', id, limits);
    for (const m of metrics) if (m.scope !== 'global') m.name = named(m.scope, m.id);

    if (fire) this.fire(metrics, now);
    for (const m of metrics) m.fired = this.firedFor(m);

    let level: BudgetStatus['level'] = 'ok';
    for (const m of metrics) {
      if (m.exceeded) {
        level = 'over';
        break;
      }
      if (m.warned) level = 'warn';
    }
    const status: BudgetStatus = { level, dayKey, monthKey, now, tz, metrics };
    this.status = status;
    return status;
  }

  private metricState(scope: BudgetScopeKind, id: string | undefined, period: BudgetPeriod, periodKey: string, metric: BudgetMetric, used: number, limit: number): BudgetMetricState {
    const percent = percentOf(used, limit);
    const state: BudgetMetricState = {
      scope,
      period,
      periodKey,
      metric,
      limit,
      used,
      percent,
      exceeded: exceededOf(used, limit),
      warned: percent >= 80,
      fired: [],
    };
    if (id) state.id = id;
    return state;
  }

  /** Dispara o maior marco alcançado ainda não coberto (marcando os menores como cobertos juntos). */
  private fire(metrics: readonly BudgetMetricState[], now: number): void {
    let changed = false;
    for (const m of metrics) {
      const reached = BUDGET_MILESTONES.filter((milestone) => (milestone === 100 ? m.exceeded : m.percent >= milestone));
      if (!reached.length) continue;
      const top = reached[reached.length - 1];
      if (this.fired.has(alertKey(m.periodKey, m.scope, m.id, m.metric, top))) continue;
      for (const milestone of BUDGET_MILESTONES) {
        if (milestone <= top) this.fired.set(alertKey(m.periodKey, m.scope, m.id, m.metric, milestone), now);
      }
      changed = true;
      const alert: BudgetAlert = {
        milestone: top,
        scope: m.scope,
        period: m.period,
        periodKey: m.periodKey,
        metric: m.metric,
        limit: m.limit,
        used: m.used,
        percent: m.percent,
        timestamp: now,
      };
      if (m.id) alert.id = m.id;
      if (m.name) alert.name = m.name;
      if (this.deps.notify) {
        try {
          void this.deps.notify(alert);
        } catch (err) {
          log.warnOnce('budget-notify', tr('Não foi possível avisar sobre o orçamento ({0}).', [errMsg(err)]));
        }
      }
    }
    if (changed) this.saveFired();
  }

  private firedFor(m: BudgetMetricState): BudgetMilestone[] {
    return BUDGET_MILESTONES.filter((milestone) => this.fired.has(alertKey(m.periodKey, m.scope, m.id, m.metric, milestone)));
  }

  /** Gasto do dia e do mês por escopo, com os nomes vistos nas estatísticas. */
  private usage(now: number, dayKey: string, monthKey: string): UsageSnapshot {
    if (this.snapshot && this.cacheMs > 0 && this.snapshot.dayKey === dayKey && this.snapshot.monthKey === monthKey && now - this.snapshot.at < this.cacheMs) {
      return this.snapshot;
    }
    const day = new Map<string, Usage>();
    const month = new Map<string, Usage>();
    const names: Names = { projects: new Map(), accounts: new Map() };
    const addDay = (key: string, stats: BudgetUsageDay): void => {
      addUsage(day, 'global', stats.totals.counts);
      for (const r of stats.rooms) {
        addUsage(day, scopeKey('project', r.id), r.counts);
        if (r.name) names.projects.set(r.id, r.name);
      }
      for (const a of stats.accounts) {
        addUsage(day, scopeKey('account', a.id), a.counts);
        if (a.name) names.accounts.set(a.id, a.name);
      }
    };
    const addMonth = (stats: BudgetUsageDay): void => {
      addUsage(month, 'global', stats.totals.counts);
      for (const r of stats.rooms) {
        addUsage(month, scopeKey('project', r.id), r.counts);
        if (r.name) names.projects.set(r.id, r.name);
      }
      for (const a of stats.accounts) {
        addUsage(month, scopeKey('account', a.id), a.counts);
        if (a.name) names.accounts.set(a.id, a.name);
      }
    };
    // Sempre os dados reais: com o modo demonstração ligado, o `day` sem fonte devolveria o demo (fictício).
    const today = this.deps.stats.day(dayKey, this.deps.stats.tz, 'real');
    if (today) addDay(dayKey, today.stats);
    for (const d of this.deps.stats.days(this.deps.stats.tz).days) {
      if (!d.startsWith(monthKey) || d > dayKey) continue;
      const r = this.deps.stats.day(d, this.deps.stats.tz, 'real');
      if (r) addMonth(r.stats);
    }
    this.snapshot = { dayKey, monthKey, at: now, day, month, names };
    return this.snapshot;
  }

  /** Descarta os avisos de períodos que terminaram. */
  private prune(dayKey: string, monthKey: string): void {
    let changed = false;
    for (const key of [...this.fired.keys()]) {
      if (keepKey(key, dayKey, monthKey)) continue;
      this.fired.delete(key);
      changed = true;
    }
    if (this.fired.size > MAX_FIRED) {
      const oldest = [...this.fired].sort((a, b) => a[1] - b[1]).slice(0, this.fired.size - MAX_FIRED);
      for (const [key] of oldest) this.fired.delete(key);
      changed = true;
    }
    if (changed) this.saveFired();
  }

  private loadFired(): void {
    if (!this.alertFile) return;
    let raw: string;
    try {
      raw = readFileSync(this.alertFile, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warnOnce('budget-alerts-read', tr('Não foi possível ler {0} ({1}); os avisos de orçamento podem se repetir.', [this.alertFile, errMsg(err)]));
      }
      return;
    }
    if (raw.length > ALERTS_FILE_MAX) {
      log.warnOnce('budget-alerts-size', tr('{0} está grande demais; os avisos de orçamento podem se repetir.', [this.alertFile]));
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; fired?: unknown };
      if (parsed.version !== 1 || !parsed.fired || typeof parsed.fired !== 'object' || Array.isArray(parsed.fired)) return;
      for (const [key, at] of Object.entries(parsed.fired as Record<string, unknown>)) {
        if (typeof at !== 'number' || !Number.isFinite(at) || !isAlertKey(key)) continue;
        this.fired.set(key.slice(0, 512), at);
      }
      for (const key of this.fired.keys()) if (!isAlertKey(key)) this.fired.delete(key);
    } catch {
      log.warnOnce('budget-alerts-corrupt', tr('{0} está ilegível; os avisos de orçamento podem se repetir.', [this.alertFile]));
    }
  }

  private saveFired(): void {
    if (!this.alertFile) return;
    try {
      mkdirSync(dirname(this.alertFile), { recursive: true });
      const tmp = `${this.alertFile}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify({ version: 1, fired: Object.fromEntries(this.fired) }, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, this.alertFile);
      log.clearOnce('budget-alerts-write');
    } catch (err) {
      log.warnOnce('budget-alerts-write', tr('Não foi possível gravar {0} ({1}); os avisos de orçamento podem se repetir.', [this.alertFile, errMsg(err)]));
    }
  }

  private safely(fn: () => void): void {
    try {
      fn();
      log.clearOnce('budget-check-fail');
    } catch (err) {
      log.warnOnce('budget-check-fail', tr('Falha ao avaliar o orçamento: {0}', [errMsg(err)]));
    }
  }
}

/** Uma chave persistida tem período|escopo|métrica|marco (nada de lixo de um arquivo editado à mão). */
function isAlertKey(key: string): boolean {
  const parts = key.split('|');
  if (parts.length !== 4) return false;
  const [period, scope, metric, milestone] = parts;
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(period)) return false;
  if (!SCOPES.some((s) => scope === s || scope.startsWith(`${s}:`))) return false;
  if (metric !== 'costUSD' && metric !== 'tokens') return false;
  return milestone === '80' || milestone === '100';
}
