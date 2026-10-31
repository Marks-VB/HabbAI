import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayKeyOf } from '../../shared/daystats';
import type { BudgetConfig } from '../../shared/budget';
import { setQuiet } from '../log';
import { tempDir } from '../test/fixtures';
import { BudgetStore } from './limits';
import { BudgetTracker, type BudgetAlert, type BudgetStatsSource, type BudgetUsageCounts, type BudgetUsageDay } from './tracker';

setQuiet(true);

const H = 3_600_000;
const DAY = 24 * H;
/** 08/10/2026 10:00 UTC. */
const T0 = Date.UTC(2026, 9, 8, 10);

interface RoomUsage {
  id: string;
  name: string;
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
}

function counts(costUSD = 0, tokensIn = 0, tokensOut = 0): BudgetUsageCounts {
  return { costUSD, tokensIn, tokensOut };
}

/** Um dia de estatísticas com o mesmo formato que o DayStatsService entrega. */
function dayStats(o: { cost?: number; tokensIn?: number; tokensOut?: number; rooms?: RoomUsage[]; accounts?: RoomUsage[] } = {}): BudgetUsageDay {
  const rows = (list: RoomUsage[] = []) => list.map((r) => ({ id: r.id, name: r.name, counts: counts(r.cost ?? 0, r.tokensIn ?? 0, r.tokensOut ?? 0) }));
  return {
    totals: { counts: counts(o.cost ?? 0, o.tokensIn ?? 0, o.tokensOut ?? 0) },
    rooms: rows(o.rooms),
    accounts: rows(o.accounts),
  };
}

class FakeStats implements BudgetStatsSource {
  readonly tz = 'UTC';
  readonly byDay = new Map<string, BudgetUsageDay>();
  /** Fonte pedida em cada leitura (o rastreador precisa sempre pedir os dados reais). */
  readonly sources: Array<string | undefined> = [];

  today(): string {
    return dayKeyOf(this.now, this.tz);
  }

  set(now: number, stats: BudgetUsageDay): void {
    this.now = now;
    this.byDay.set(dayKeyOf(now, this.tz), stats);
  }

  days(): { days: string[] } {
    return { days: [...this.byDay.keys()].sort().reverse() };
  }

  day(key: string, _tz?: string, source?: 'real' | 'demo'): { stats: BudgetUsageDay } | null {
    this.sources.push(source);
    const stats = this.byDay.get(key);
    return stats ? { stats } : null;
  }

  constructor(public now = T0) {}
}

function trackerWith(config: BudgetConfig, stats: FakeStats, alertFile: string | null, notify?: (a: BudgetAlert) => void) {
  const store = new BudgetStore(null);
  if (!store.save(config).ok) throw new Error('configuração de teste inválida');
  return new BudgetTracker({ store, stats, alertFile, cacheMs: 0, notify });
}

const dayLimit = (costUSD?: number, tokens?: number): BudgetConfig => ({
  version: 1,
  limits: { day: { ...(costUSD === undefined ? {} : { costUSD }), ...(tokens === undefined ? {} : { tokens }) } },
});

describe('BudgetTracker: percentual e estado', () => {
  it('calcula o percentual, o aviso e o estouro', () => {
    const stats = new FakeStats();
    stats.set(T0, dayStats({ cost: 8 }));
    const seen: BudgetAlert[] = [];
    const t = trackerWith(dayLimit(10), stats, null, (a) => seen.push(a));
    const s = t.check(T0);
    expect(s.level).toBe('warn');
    expect(s.dayKey).toBe('2026-10-08');
    expect(s.monthKey).toBe('2026-10');
    const m = s.metrics[0];
    expect(m).toMatchObject({ scope: 'global', period: 'day', periodKey: '2026-10-08', metric: 'costUSD', limit: 10, used: 8, exceeded: false, warned: true });
    expect(m.percent).toBeCloseTo(80, 6);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ milestone: 80, scope: 'global', period: 'day', metric: 'costUSD', limit: 10, used: 8 });
    // Com o modo demonstração ligado, o DayStatsService devolveria o demo sem `source`: o orçamento é sempre real.
    expect(stats.sources).not.toContain(undefined);
    expect(stats.sources.every((s) => s === 'real')).toBe(true);

    stats.set(T0, dayStats({ cost: 12 }));
    const over = t.check(T0);
    expect(over.level).toBe('over');
    expect(over.metrics[0]).toMatchObject({ used: 12, percent: 120, exceeded: true, warned: true });
    expect(seen).toHaveLength(2);
    expect(seen[1].milestone).toBe(100);
  });

  it('limite zero: sem gasto fica em 0%; qualquer gasto estoura', () => {
    const stats = new FakeStats();
    stats.set(T0, dayStats({ cost: 0 }));
    const seen: BudgetAlert[] = [];
    const t = trackerWith(dayLimit(0), stats, null, (a) => seen.push(a));
    expect(t.check(T0).metrics[0]).toMatchObject({ limit: 0, used: 0, percent: 0, exceeded: false, warned: false });
    expect(seen).toHaveLength(0);

    stats.set(T0, dayStats({ cost: 0.01 }));
    const s = t.check(T0);
    expect(s.metrics[0]).toMatchObject({ used: 0.01, percent: 100, exceeded: true, warned: true });
    expect(seen.map((a) => a.milestone)).toEqual([100]);
  });

  it('soma tokens de entrada e saída', () => {
    const stats = new FakeStats();
    stats.set(T0, dayStats({ tokensIn: 600, tokensOut: 300 }));
    const t = trackerWith(dayLimit(undefined, 1_000), stats, null);
    const m = t.check(T0).metrics[0];
    expect(m).toMatchObject({ metric: 'tokens', used: 900, limit: 1_000, warned: true });
    expect(m.percent).toBeCloseTo(90, 6);
  });

  it('sem limite configurado não há métricas nem avisos', () => {
    const stats = new FakeStats();
    stats.set(T0, dayStats({ cost: 100 }));
    const seen: BudgetAlert[] = [];
    const t = trackerWith({ version: 1, limits: {} }, stats, null, (a) => seen.push(a));
    const s = t.check(T0);
    expect(s.metrics).toEqual([]);
    expect(s.level).toBe('ok');
    expect(seen).toHaveLength(0);
  });

  it('statusOf lê sem disparar avisos; get() avalia e devolve a configuração', () => {
    const stats = new FakeStats();
    stats.set(T0, dayStats({ cost: 9 }));
    const seen: BudgetAlert[] = [];
    const t = trackerWith(dayLimit(10), stats, null, (a) => seen.push(a));
    expect(t.statusOf(T0).level).toBe('warn');
    expect(seen).toHaveLength(0);
    const r = t.get(T0);
    expect(r.config.limits.day?.costUSD).toBe(10);
    expect(r.status.level).toBe('warn');
    expect(seen).toHaveLength(1);
  });
});

describe('BudgetTracker: avisos uma vez por período', () => {
  it('não repete o mesmo marco e cobre o menor quando o maior já disparou', () => {
    const tmp = tempDir();
    try {
      const stats = new FakeStats();
      stats.set(T0, dayStats({ cost: 9.5 }));
      const seen: BudgetAlert[] = [];
      const file = join(tmp.dir, 'budget-alerts.json');
      const t = trackerWith(dayLimit(10), stats, file, (a) => seen.push(a));
      expect(t.check(T0).metrics[0].fired).toEqual([80]);
      expect(t.check(T0).metrics[0].fired).toEqual([80]);
      expect(seen).toHaveLength(1);

      stats.set(T0, dayStats({ cost: 15 }));
      const over = t.check(T0);
      expect(over.metrics[0].fired).toEqual([80, 100]);
      expect(seen.map((a) => a.milestone)).toEqual([80, 100]);
      expect(t.check(T0).metrics[0].fired).toEqual([80, 100]);
      expect(seen).toHaveLength(2);
      expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
    } finally {
      tmp.cleanup();
    }
  });

  it('saltar direto para 100% avisa só o marco de 100', () => {
    const stats = new FakeStats();
    stats.set(T0, dayStats({ cost: 30 }));
    const seen: BudgetAlert[] = [];
    const t = trackerWith(dayLimit(10), stats, null, (a) => seen.push(a));
    const s = t.check(T0);
    expect(s.metrics[0].fired).toEqual([80, 100]);
    expect(seen.map((a) => a.milestone)).toEqual([100]);
  });

  it('reiniciar o servidor no mesmo dia não repete o aviso', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'budget-alerts.json');
      const stats = new FakeStats();
      stats.set(T0, dayStats({ cost: 9 }));
      const first: BudgetAlert[] = [];
      trackerWith(dayLimit(10), stats, file, (a) => first.push(a)).check(T0);
      expect(first).toHaveLength(1);

      const second: BudgetAlert[] = [];
      const t2 = trackerWith(dayLimit(10), stats, file, (a) => second.push(a));
      const s = t2.check(T0);
      expect(second).toHaveLength(0);
      expect(s.metrics[0].fired).toEqual([80]);
    } finally {
      tmp.cleanup();
    }
  });

  it('virada do dia: os avisos do dia recomeçam, os do mês continuam', () => {
    const tmp = tempDir();
    try {
      const stats = new FakeStats();
      stats.set(T0, dayStats({ cost: 9, tokensIn: 900 }));
      stats.byDay.set('2026-10-01', dayStats({ cost: 72 }));
      const seen: BudgetAlert[] = [];
      const config: BudgetConfig = { version: 1, limits: { day: { costUSD: 10 }, month: { costUSD: 100 } } };
      const t = trackerWith(config, stats, join(tmp.dir, 'alerts.json'), (a) => seen.push(a));
      const first = t.check(T0);
      expect(seen.map((a) => `${a.period}:${a.milestone}`)).toEqual(['day:80', 'month:80']);

      const nextDay = T0 + DAY;
      stats.set(nextDay, dayStats({ cost: 9 }));
      const s = t.check(nextDay);
      expect(s.dayKey).toBe('2026-10-09');
      const dayMetric = s.metrics.find((m) => m.period === 'day')!;
      const monthMetric = s.metrics.find((m) => m.period === 'month')!;
      expect(dayMetric.fired).toEqual([80]);
      expect(monthMetric.fired).toEqual([80]);
      // Mês: 72 + 9 + 9 = 90 -> 90%.
      expect(monthMetric.used).toBe(90);
      expect(monthMetric.percent).toBeCloseTo(90, 6);
      expect(seen.map((a) => `${a.period}:${a.milestone}`)).toEqual(['day:80', 'month:80', 'day:80']);
      expect(first.metrics).toHaveLength(2);
    } finally {
      tmp.cleanup();
    }
  });

  it('virada do mês: o gasto e os avisos do mês recomeçam', () => {
    const tmp = tempDir();
    try {
      const stats = new FakeStats();
      const seen: BudgetAlert[] = [];
      const config: BudgetConfig = { version: 1, limits: { month: { costUSD: 100 } } };
      const t = trackerWith(config, stats, join(tmp.dir, 'alerts.json'), (a) => seen.push(a));
      stats.set(Date.UTC(2026, 9, 1, 12), dayStats({ cost: 70 }));
      t.check(Date.UTC(2026, 9, 1, 12));
      const oct = Date.UTC(2026, 9, 2, 12);
      stats.set(oct, dayStats({ cost: 20 }));
      const s = t.check(oct);
      expect(s.monthKey).toBe('2026-10');
      expect(s.metrics[0]).toMatchObject({ used: 90, warned: true, percent: 90 });
      expect(seen.map((a) => a.milestone)).toEqual([80]);

      const nov = Date.UTC(2026, 10, 1, 12);
      stats.set(nov, dayStats({ cost: 30 }));
      const n = t.check(nov);
      expect(n.monthKey).toBe('2026-11');
      expect(n.metrics[0]).toMatchObject({ used: 30, percent: 30, warned: false, exceeded: false });
      expect(n.metrics[0].fired).toEqual([]);
      expect(n.level).toBe('ok');
      expect(seen).toHaveLength(1);
    } finally {
      tmp.cleanup();
    }
  });
});

describe('BudgetTracker: escopo por projeto e por conta', () => {
  it('cada escopo usa o próprio gasto e tem avisos separados', () => {
    const stats = new FakeStats();
    stats.set(
      T0,
      dayStats({
        cost: 9,
        tokensIn: 900,
        rooms: [
          { id: '/p/loja', name: 'loja', cost: 9, tokensIn: 900 },
          { id: '/p/outro', name: 'outro', cost: 0 },
        ],
        accounts: [
          { id: '.claude', name: 'Conta C', cost: 9, tokensIn: 900 },
          { id: '.claude-2', name: 'Conta D', cost: 0 },
        ],
      }),
    );
    const seen: BudgetAlert[] = [];
    const config: BudgetConfig = {
      version: 1,
      limits: { day: { costUSD: 100 } },
      projects: { '/p/loja': { day: { costUSD: 10 } } },
      accounts: { '.claude': { day: { tokens: 1_000 } }, '.claude-2': { day: { costUSD: 5 } } },
    };
    const t = trackerWith(config, stats, null, (a) => seen.push(a));
    const s = t.check(T0);
    expect(s.metrics).toHaveLength(4);
    expect(s.level).toBe('warn');

    const global = s.metrics.find((m) => m.scope === 'global')!;
    expect(global).toMatchObject({ used: 9, limit: 100, percent: 9, warned: false });
    const project = s.metrics.find((m) => m.scope === 'project' && m.id === '/p/loja')!;
    expect(project).toMatchObject({ name: 'loja', used: 9, limit: 10, warned: true, percent: 90 });
    const account = s.metrics.find((m) => m.scope === 'account' && m.id === '.claude')!;
    expect(account).toMatchObject({ name: 'Conta C', metric: 'tokens', used: 900, limit: 1_000, warned: true });
    const other = s.metrics.find((m) => m.scope === 'account' && m.id === '.claude-2')!;
    expect(other).toMatchObject({ used: 0, percent: 0, warned: false });
    expect(seen.map((a) => `${a.scope}:${a.id ?? ''}:${a.milestone}`).sort()).toEqual(['account:.claude:80', 'project:/p/loja:80']);
  });
});
