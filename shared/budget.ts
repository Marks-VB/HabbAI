// Orçamento: limites de custo e de tokens por dia e por mês, com escopo opcional por projeto (sala) e por conta.
// Código puro (sem Node nem DOM): o servidor lê e grava o arquivo (server/budget/limits.ts), avalia o gasto
// (server/budget/tracker.ts) e o navegador só consome o protocolo de GET/PUT /api/budget.
//
// O custo é o mesmo de shared/daystats.ts: `costUSD`, em dólares. "tokens" = tokensIn + tokensOut.
// Sem limite configurado para uma métrica, ela nem aparece no estado (não há o que avisar).

/** Marcos de aviso (percentual do limite) — cada um dispara uma vez por período e escopo. */
export const BUDGET_MILESTONES = [80, 100] as const;
export type BudgetMilestone = (typeof BUDGET_MILESTONES)[number];

export type BudgetPeriod = 'day' | 'month';
export type BudgetMetric = 'costUSD' | 'tokens';
/** global = escritório inteiro; project = uma sala (id = cwd); account = uma conta (AccountInfo.id). */
export type BudgetScopeKind = 'global' | 'project' | 'account';

/** Limites de um período. Ausente = sem limite; 0 = qualquer gasto já estoura. */
export interface BudgetLimit {
  /** Custo em dólares (mesma moeda de StatsCounts.costUSD). */
  costUSD?: number;
  /** Tokens de entrada + saída. */
  tokens?: number;
}

export interface BudgetScopeLimits {
  day?: BudgetLimit;
  month?: BudgetLimit;
}

/** Formato de ~/.habblaud/budget.json (listas por escopo ficam em objetos com id -> limites). */
export interface BudgetConfig {
  version: 1;
  /** Limites do escritório inteiro. */
  limits: BudgetScopeLimits;
  /** Limites por projeto (RoomInfo.id = cwd normalizado). */
  projects?: Record<string, BudgetScopeLimits>;
  /** Limites por conta (AccountInfo.id). */
  accounts?: Record<string, BudgetScopeLimits>;
}

/** Situação de uma métrica em um período e escopo. */
export interface BudgetMetricState {
  scope: BudgetScopeKind;
  /** Id do projeto ou da conta (ausente no escopo global). */
  id?: string;
  /** Nome exibido do projeto ou da conta, quando conhecido. */
  name?: string;
  period: BudgetPeriod;
  /** AAAA-MM-DD (dia) ou AAAA-MM (mês) no fuso do servidor. */
  periodKey: string;
  metric: BudgetMetric;
  limit: number;
  used: number;
  /** used / limit * 100. Limite 0: 100 quando há gasto, 0 quando não há. */
  percent: number;
  exceeded: boolean;
  /** Chegou a 80% do limite (inclui os estourados). */
  warned: boolean;
  /** Marcos já cobertos neste período e escopo (persistidos entre reinícios). */
  fired: BudgetMilestone[];
}

export interface BudgetStatus {
  /** over = algum limite estourado; warn = algum passou de 80%; ok = nenhum dos dois. */
  level: 'ok' | 'warn' | 'over';
  /** Hoje (AAAA-MM-DD) e o mês (AAAA-MM) no fuso do servidor. */
  dayKey: string;
  monthKey: string;
  now: number;
  tz: string;
  /** Só as métricas que têm limite configurado. */
  metrics: BudgetMetricState[];
}

/** Resposta de GET /api/budget e de PUT /api/budget. */
export interface BudgetResponse {
  config: BudgetConfig;
  status: BudgetStatus;
}

/** Configuração sem nenhum limite (o padrão de quem nunca abriu as Configurações). */
export function emptyBudgetConfig(): BudgetConfig {
  return { version: 1, limits: {} };
}

/** Cópia profunda da configuração (o estado em memória nunca é entregue por referência). */
export function copyBudgetConfig(c: BudgetConfig): BudgetConfig {
  const copyLimits = (l: BudgetScopeLimits): BudgetScopeLimits => {
    const out: BudgetScopeLimits = {};
    if (l.day) out.day = { ...l.day };
    if (l.month) out.month = { ...l.month };
    return out;
  };
  const out: BudgetConfig = { version: 1, limits: copyLimits(c.limits) };
  if (c.projects) {
    out.projects = Object.create(null) as Record<string, BudgetScopeLimits>;
    for (const [id, l] of Object.entries(c.projects)) out.projects[id] = copyLimits(l);
  }
  if (c.accounts) {
    out.accounts = Object.create(null) as Record<string, BudgetScopeLimits>;
    for (const [id, l] of Object.entries(c.accounts)) out.accounts[id] = copyLimits(l);
  }
  return out;
}
