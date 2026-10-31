// Registro mínimo de contadores e gauges, exportado no formato de texto do Prometheus, sem dependências.
//
// Cada família declara o nome, o texto de ajuda, o tipo e os nomes dos rótulos; os valores vivem em séries
// (uma por combinação de rótulos). A cardinalidade é limitada por família (MAX_SERIES_PER_FAMILY): o que
// passar do teto é descartado em vez de crescer sem controle, e o descarte aparece em
// `habblaud_metrics_series_dropped_total{metric="..."}` — assim um rótulo errado (URL crua, id de sessão)
// não vira um vazamento de memória silencioso.

export type Labels = Readonly<Record<string, string>>;
export type MetricType = 'counter' | 'gauge';

/** Teto de séries por família: acima disto as combinações novas são descartadas (e contadas). */
export const MAX_SERIES_PER_FAMILY = 200;

const DROPPED_METRIC = 'habblaud_metrics_series_dropped_total';
const SEP = '\u0000';

interface Series {
  labels: Labels;
  value: number;
}

/** Uma família de métricas (nome + tipo + rótulos) e as séries já vistas. */
class Family {
  readonly series = new Map<string, Series>();
  dropped = 0;

  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: MetricType,
    readonly labelNames: readonly string[],
  ) {}

  /** Série da combinação de rótulos, criando-a (ou devolvendo undefined se o teto foi atingido). */
  seriesFor(labels: Labels): Series | undefined {
    const key = keyOf(this.labelNames, labels);
    const found = this.series.get(key);
    if (found) return found;
    if (this.series.size >= MAX_SERIES_PER_FAMILY) {
      this.dropped++;
      return undefined;
    }
    const fresh: Series = { labels, value: 0 };
    this.series.set(key, fresh);
    return fresh;
  }
}

function keyOf(labelNames: readonly string[], labels: Labels): string {
  return labelNames.map((n) => `${n}=${labels[n] ?? ''}`).join(SEP);
}

/** Valor de rótulo no formato de texto do Prometheus (barra invertida, aspas e quebra de linha escapadas). */
export function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labelNames: readonly string[], labels: Labels): string {
  if (!labelNames.length) return '';
  const pairs = labelNames.map((n) => `${n}="${escapeLabel(labels[n] ?? '')}"`);
  return `{${pairs.join(',')}}`;
}

function renderValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(value);
}

/** Contador: só sobe (incrementos negativos são ignorados). */
export class Counter {
  constructor(private readonly family: Family) {}

  /** Garante a série em 0, para a métrica aparecer mesmo antes do primeiro incremento. */
  init(labels: Labels = {}): void {
    this.family.seriesFor(labels);
  }

  inc(labels: Labels = {}, by = 1): void {
    if (!(by > 0)) return;
    const series = this.family.seriesFor(labels);
    if (series) series.value += by;
  }
}

/** Gauge: valor absoluto (ou soma de um delta) que pode subir e descer. */
export class Gauge {
  constructor(private readonly family: Family) {}

  set(value: number, labels: Labels = {}): void {
    const series = this.family.seriesFor(labels);
    if (series) series.value = Number.isFinite(value) ? value : 0;
  }

  add(delta: number, labels: Labels = {}): void {
    const series = this.family.seriesFor(labels);
    if (series) series.value += Number.isFinite(delta) ? delta : 0;
  }
}

/**
 * Registro de métricas. `counter()`/`gauge()` devolvem o handle da família (chamar de novo com o mesmo nome
 * devolve a mesma família); `render()` devolve o texto do Prometheus, com as famílias e as séries em ordem
 * estável — o mesmo estado sempre gera o mesmo texto.
 */
export class MetricsRegistry {
  private readonly families = new Map<string, Family>();

  counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
    return new Counter(this.family(name, help, 'counter', labelNames));
  }

  gauge(name: string, help: string, labelNames: readonly string[] = []): Gauge {
    return new Gauge(this.family(name, help, 'gauge', labelNames));
  }

  /** Nomes das famílias registradas (sem a de descartes), em ordem alfabética. */
  names(): string[] {
    return [...this.families.keys()].sort();
  }

  render(): string {
    const blocks: string[] = [];
    for (const name of this.names()) {
      const family = this.families.get(name)!;
      blocks.push(renderFamily(name, family.help, family.type, family.labelNames, [...family.series.values()]));
    }
    const dropped = [...this.families.values()].filter((f) => f.dropped > 0);
    if (dropped.length) {
      // Ajuda e tipo são fixos; a família não existe no mapa para não colidir com um nome registrado.
      const series = dropped.map((f) => ({ labels: { metric: f.name }, value: f.dropped }));
      blocks.push(
        renderFamily(
          DROPPED_METRIC,
          'Séries descartadas por família ao passar do teto de cardinalidade.',
          'counter',
          ['metric'],
          series.sort((a, b) => (a.labels.metric ?? '').localeCompare(b.labels.metric ?? '')),
        ),
      );
    }
    return blocks.length ? `${blocks.join('')}` : '';
  }

  private family(name: string, help: string, type: MetricType, labelNames: readonly string[]): Family {
    if (name === DROPPED_METRIC) throw new Error(`${DROPPED_METRIC} é reservado pelo registro`);
    const existing = this.families.get(name);
    if (existing) {
      if (existing.type !== type) throw new Error(`métrica ${name} já é ${existing.type}`);
      const sameLabels = existing.labelNames.length === labelNames.length && existing.labelNames.every((n, i) => n === labelNames[i]);
      if (!sameLabels) throw new Error(`métrica ${name} já foi declarada com outros rótulos`);
      return existing;
    }
    const family = new Family(name, help, type, labelNames);
    this.families.set(name, family);
    return family;
  }
}

function renderFamily(name: string, help: string, type: MetricType, labelNames: readonly string[], series: readonly Series[]): string {
  const lines = [`# HELP ${name} ${help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}`, `# TYPE ${name} ${type}`];
  const sorted = [...series].sort((a, b) => keyOf(labelNames, a.labels).localeCompare(keyOf(labelNames, b.labels)));
  for (const s of sorted) lines.push(`${name}${renderLabels(labelNames, s.labels)} ${renderValue(s.value)}`);
  return `${lines.join('\n')}\n`;
}
